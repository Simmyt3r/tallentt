// Showroom media screening v1. Queue is PostgreSQL-backed so a serverless
// worker can resume after a crash. External OCR is deliberately not decisive
// for account suspensions: detections hold only the specific Showroom media.
import { timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { containsContactBypass } from './showroomEligibility.js'

export const mediaScreeningEnabled = () => process.env.SHOWROOM_MEDIA_SCREENING === 'enforce'
export const newMediaScreeningStatus = () => mediaScreeningEnabled() ? 'pending' : 'legacy'

export function authorizedScreeningWorker(header, secret = process.env.SHOWROOM_WORKER_SECRET) {
  if (!secret || secret.length < 16 || typeof header !== 'string') return false
  const supplied = Buffer.from(header)
  const expected = Buffer.from('Bearer ' + secret)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function trustedMediaImageUri(media, cloud = process.env.CLOUDINARY_CLOUD_NAME) {
  if (!cloud || !/^[a-z0-9_-]{1,100}$/i.test(cloud)) return null
  if (media.type !== 'image' && media.type !== 'video') return null
  let url
  try { url = new URL(media.url) } catch { return null }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' ||
      url.username || url.password || url.port || url.search || url.hash) return null
  const prefix = '/' + cloud + '/' + (media.type === 'video' ? 'video' : 'image') + '/upload/'
  if (!url.pathname.startsWith(prefix)) return null
  const rest = url.pathname.slice(prefix.length)
  const match = rest.match(/^v[0-9]+\/(.+)\.([a-z0-9]+)$/i)
  if (!match) return null
  let mediaId
  try { mediaId = decodeURIComponent(match[1]) } catch { return null }
  if (!media.public_id || mediaId !== media.public_id) return null
  if (media.type === 'video') {
    // Screening ONE extracted frame is not full-length video moderation.
    url.pathname = prefix + 'so_0,w_640,c_limit/' + rest.replace(/\.[^.]+$/, '.jpg')
  }
  return url.toString()
}

export function classifyImageAnnotations(result) {
  const text = String(result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || '').slice(0, 20000)
  if (containsContactBypass(text)) return { status: 'held', reason: 'contact_details_in_media' }
  const safety = result?.safeSearchAnnotation || {}
  if (['LIKELY','VERY_LIKELY'].includes(safety.adult) ||
      ['LIKELY','VERY_LIKELY'].includes(safety.violence) ||
      safety.racy === 'VERY_LIKELY') {
    return { status: 'held', reason: 'possible_unsafe_media' }
  }
  return { status: 'passed', reason: null }
}

export async function inspectMediaAsset(media, { fetchImpl = fetch, cloud = process.env.CLOUDINARY_CLOUD_NAME,
  apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY } = {}) {
  const uri = trustedMediaImageUri(media, cloud)
  if (!uri) return { status: 'held', reason: 'unverified_media_source' }
  if (!apiKey) throw new Error('Vision screening credentials are not configured.')
  const response = await fetchImpl('https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ requests: [{
      image: { source: { imageUri: uri } },
      features: [{ type: 'TEXT_DETECTION' }, { type: 'SAFE_SEARCH_DETECTION' }],
    }] }),
  })
  if (!response.ok) throw new Error('Vision API unavailable')
  const result = await response.json()
  if (!result.responses?.length || result.responses[0].error || !result.responses[0].safeSearchAnnotation) throw new Error('Vision analysis incomplete')
  return classifyImageAnnotations(result.responses[0])
}

export async function claimScreeningJob() {
  const { rows } = await query(`WITH picked AS (
    SELECT id FROM hat_media
    WHERE (screening_status = 'pending' AND screening_retry_at <= NOW())
       OR (screening_status = 'processing' AND screening_locked_at < NOW() - INTERVAL '5 minutes')
    ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE hat_media m SET screening_status = 'processing',
    screening_locked_at = NOW(), screening_lock_token = gen_random_uuid(),
    screening_attempts = m.screening_attempts + 1
  FROM picked WHERE m.id = picked.id
  RETURNING m.id, m.hat_id, m.url, m.public_id, m.type,
            m.screening_attempts, m.screening_lock_token`)
  return rows[0] || null
}

async function finalizeJob(job, status, reason, retry = false) {
  // Lease token prevents an expired worker from overwriting a later decision.
  const { rowCount } = await query(
    `UPDATE hat_media SET screening_status = $3,
       screening_reason = $4,
       screening_checked_at = CASE WHEN $5::boolean THEN screening_checked_at ELSE NOW() END,
       screening_locked_at = NULL, screening_lock_token = NULL,
       screening_retry_at = CASE WHEN $5::boolean THEN
         NOW() + (LEAST(60, POWER(2, LEAST(screening_attempts, 6))::int) * INTERVAL '1 minute')
         ELSE screening_retry_at END
     WHERE id = $1 AND screening_lock_token = $2 AND screening_status = 'processing'`,
    [job.id, job.screening_lock_token, status, reason, retry],
  )
  return rowCount > 0
}

export async function screenQueuedMedia({ inspect = inspectMediaAsset, maxItems = 4 } = {}) {
  if (!mediaScreeningEnabled()) return { disabled: true, checked: 0, held: 0, passed: 0, retried: 0 }
  if (!process.env.GOOGLE_CLOUD_VISION_API_KEY) {
    const err = new Error('Screening is enforced but GOOGLE_CLOUD_VISION_API_KEY is missing.')
    err.status = 503
    throw err
  }
  const result = { checked: 0, held: 0, passed: 0, retried: 0 }
  for (let i = 0; i < Math.min(6, Math.max(1, maxItems)); i++) {
    const job = await claimScreeningJob()
    if (!job) break
    result.checked++
    try {
      // Cheap exact-asset collision check against other creators. Not perceptual hashing.
      const { rows: duplicates } = await query(
        `SELECT EXISTS (
           SELECT 1 FROM hat_media other
           JOIN hats a ON a.id = other.hat_id
           JOIN hats b ON b.id = $1
           WHERE other.id <> $2 AND other.public_id = $3 AND a.user_id <> b.user_id
         ) AS duplicated`,
        [job.hat_id, job.id, job.public_id],
      )
      const finding = duplicates[0]?.duplicated
        ? { status: 'held', reason: 'asset_used_by_another_creator' }
        : await inspect(job)
      await finalizeJob(job, finding.status, finding.reason, false)
      result[finding.status === 'passed' ? 'passed' : 'held']++
    } catch {
      const retry = Number(job.screening_attempts) < 3
      await finalizeJob(job, retry ? 'pending' : 'held',
        retry ? 'screening_retry_scheduled' : 'screening_unavailable', retry)
      result[retry ? 'retried' : 'held']++
    }
  }
  return result
}

export async function mediaScreeningReviewQueue() {
  const { rows } = await query(
    `SELECT m.id AS media_id, m.hat_id, m.type, m.url, m.screening_status,
            m.screening_reason, m.screening_attempts, m.screening_checked_at,
            h.hat_title, u.username AS owner_username
     FROM hat_media m JOIN hats h ON h.id = m.hat_id JOIN users u ON u.id = h.user_id
     WHERE m.screening_status IN ('held','rejected')
     ORDER BY m.screening_checked_at ASC NULLS LAST, m.id
     LIMIT 40`,
  )
  const { rows: totals } = await query(
    `SELECT screening_status, COUNT(*)::int AS count FROM hat_media
     WHERE screening_status IN ('pending','processing','held','rejected')
     GROUP BY screening_status`,
  )
  return { items: rows, counts: Object.fromEntries(totals.map(x => [x.screening_status, x.count])) }
}

export async function decideMediaScreening(adminId, mediaId, decision) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(mediaId || ''))) {
    throw Object.assign(new Error('Invalid media.'), { status: 400 })
  }
  if (!['approve','reject'].includes(decision)) {
    throw Object.assign(new Error('Invalid decision.'), { status: 400 })
  }
  // Restriction: all new media on this Hat must pass before Showroom admission.
  const { rows } = await query(
    `UPDATE hat_media SET screening_status = $2, screening_reason = $3,
            screening_checked_at = NOW(), screening_locked_at = NULL,
            screening_lock_token = NULL
     WHERE id = $1 AND screening_status IN ('held','rejected')
     RETURNING hat_id`,
    [mediaId, decision === 'approve' ? 'passed' : 'rejected',
     decision === 'approve' ? 'manually_approved' : 'manually_rejected'],
  )
  if (!rows[0]) throw Object.assign(new Error('Media is no longer awaiting review.'), { status: 409 })
  await query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
     VALUES ($1,'resolve_showroom_media','hat',$2,$3::jsonb)`,
    [adminId, rows[0].hat_id, JSON.stringify({ mediaId, decision })],
  )
  return { ok: true, mediaId, decision }
}
