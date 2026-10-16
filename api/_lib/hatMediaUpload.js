// Signed browser upload permits for Hat media.
// Provider credentials never reach the browser. A server-issued public ID is
// bound to the authenticated user and checked with Cloudinary before use.
import { createHash, randomUUID } from 'node:crypto'
import { supportedHatMediaMime, MAX_HAT_MEDIA_BYTES } from '../../shared/hatMediaTypes.js'
import { query } from './db.js'

const MAX_BYTES = MAX_HAT_MEDIA_BYTES
const validUUID = v => /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(String(v || ''))
const bad = (status, message) => Object.assign(new Error(message), { status })

export function signedHatMediaEnabled() {
  return process.env.HAT_MEDIA_SIGNED_UPLOADS === 'enforce'
}

export function uploadCloudCredentials() {
  // Upload credentials are deliberately Vercel-side; NEVER accept them from
  // the Admin browser, from a media payload, or via Cloudinary URLs.
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !/^[a-z0-9_-]{2,100}$/i.test(cloudName) || !apiKey || !apiSecret) {
    throw bad(503, 'Cloudinary signed uploads are not configured on the server.')
  }
  return {cloudName,apiKey,apiSecret}
}

export function cloudinaryUploadSignature(parameters, apiSecret) {
  const entries = Object.entries(parameters).filter(([,v])=>v !== undefined && v !== null)
  const signed = entries.sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&')
  return createHash('sha1').update(signed + apiSecret).digest('hex')
}

export async function issueHatUploadPermit(userId, meta) {
  if (!signedHatMediaEnabled()) return {enabled:false}
  if (!validUUID(userId)) throw bad(401, 'Please sign in to upload media.')
  const mime = String(meta?.mime || '').toLowerCase().trim()
  const size = meta?.bytes
  if (!supportedHatMediaMime(mime) || !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) {
    throw bad(400, 'Unsupported media format or file larger than 20MB.')
  }
  const {cloudName,apiKey,apiSecret} = uploadCloudCredentials()
  // Prevent one session reserving thousands of IDs and consuming storage.
  const {rows:recent} = await query(
    "SELECT COUNT(*)::int AS count FROM hat_media_upload_permits WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
    [userId],
  )
  if (recent[0]?.count >= 60) throw bad(429, 'Upload limit reached. Try again in an hour.')
  const resourceType = mime.startsWith('image/') ? 'image' : 'video'
  const permitId = randomUUID()
  const publicId = `chombutar_hats/${userId}/${permitId}`
  const timestamp = Math.floor(Date.now()/1000)
  const params = {public_id:publicId, timestamp, overwrite:'false'}
  const signature = cloudinaryUploadSignature(params, apiSecret)
  await query(
    `INSERT INTO hat_media_upload_permits
       (id,user_id,public_id,resource_type,declared_mime,declared_bytes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
    [permitId,userId,publicId,resourceType,mime,size],
  )
  return {
    enabled:true, permitId, cloudName, apiKey, resourceType,
    signature, params,
  }
}

export async function verifyNewHatMedia(userId, mediaList, previousMedia = [], {
  fetchImpl=fetch,
} = {}) {
  if (!signedHatMediaEnabled()) return []
  if (!Array.isArray(mediaList) || mediaList.length > 20) throw bad(400,'Provide at most 20 media files.')
  const existing = new Map(previousMedia.map(m=>[m.public_id,m]))
  const distinct = new Set()
  const verified = []
  for (const m of mediaList) {
    if (!m || typeof m !== 'object' || typeof m.public_id !== 'string') throw bad(422,'Media details are missing.')
    if (distinct.has(m.public_id)) throw bad(422,'The same media cannot be attached twice.')
    distinct.add(m.public_id)
    const prev = existing.get(m.public_id)
    if (prev && prev.url === m.url && prev.type === m.type) continue
    if (!m.upload_id) {
      // Reusing an existing, approved asset from the same subscriber's
      // library is permitted without issuing another Cloudinary upload.
      // Every media field is matched to the authoritative owner record.
      const {rows:owned} = await query(`SELECT 1 FROM hat_media archived
        JOIN hats owner_hat ON owner_hat.id=archived.hat_id
        WHERE owner_hat.user_id=$1 AND archived.public_id=$2
          AND archived.url=$3 AND archived.type=$4
          AND archived.screening_status IN ('legacy','passed')
        LIMIT 1`, [userId,m.public_id,m.url,m.type])
      if (owned.length) continue
      throw bad(422,'Archived media is unavailable or does not belong to your account.')
    }
    if (!validUUID(m.upload_id)) throw bad(422,'New media must be uploaded through the secure uploader.')
    const {rows} = await query(
      `SELECT id,user_id,public_id,resource_type,declared_mime,declared_bytes,claimed_hat_id,
              expires_at FROM hat_media_upload_permits
       WHERE id = $1 AND user_id = $2 AND public_id = $3 AND claimed_at IS NULL`,
      [m.upload_id,userId,m.public_id],
    )
    const permit=rows[0]
    if (!permit || Date.parse(permit.expires_at) <= Date.now()) throw bad(422,'Upload authorization has expired. Upload this file again.')
    const {cloudName,apiKey,apiSecret}=uploadCloudCredentials()
    const resourceType=permit.resource_type
    const expectedType = permit.declared_mime.startsWith('audio/') ? 'audio' : resourceType
    if (m.type !== expectedType) throw bad(422,'Media resource type does not match its upload authorization.')
    // The authoritative resource record proves that the signed public ID
    // actually exists in our Cloudinary account and has the expected URL.
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload/${encodeURIComponent(permit.public_id)}`
    let response
    try {
      response = await fetchImpl(url, {
        headers:{Authorization:'Basic '+Buffer.from(apiKey+':'+apiSecret).toString('base64')},
        signal:AbortSignal.timeout(9000),
      })
    } catch {throw bad(503,'Could not verify the uploaded media. Please retry.')}
    if (!response.ok) throw bad(422,'Cloudinary has not confirmed this upload.')
    let asset
    try {asset=await response.json()}catch{throw bad(503,'Cloudinary verification returned an invalid response.')}
    if (asset?.public_id !== permit.public_id || asset?.resource_type !== resourceType ||
        asset?.type !== 'upload' || !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 || asset.bytes > MAX_BYTES || asset.bytes > Math.max(permit.declared_bytes + 4096, permit.declared_bytes * 1.15) ||
        typeof asset.secure_url !== 'string' || asset.secure_url !== m.url ||
        !asset.secure_url.startsWith(`https://res.cloudinary.com/${cloudName}/${resourceType}/upload/`) ||
        !(Number.isSafeInteger(asset.version) && asset.version > 0)) {
      throw bad(422,'Media metadata does not match the authorized upload.')
    }
    verified.push({permitId:permit.id,publicId:permit.public_id})
  }
  return verified
}

export async function claimHatMediaPermits(client, userId, hatId, verified) {
  for(const m of verified) {
    const {rowCount} = await client.query(
      `UPDATE hat_media_upload_permits
       SET claimed_hat_id=$1, claimed_at=NOW()
       WHERE id=$2 AND user_id=$3 AND public_id=$4 AND claimed_at IS NULL
         AND expires_at>NOW()`,
      [hatId,m.permitId,userId,m.publicId],
    )
    if (rowCount !== 1) throw bad(409,'Media upload was already used or expired. Please upload it again.')
  }
}
