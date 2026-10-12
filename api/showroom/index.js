import { query } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import { reportShowroomHat } from '../_lib/showroomReports.js'
import { myShowroomModeration, submitShowroomAppeal } from '../_lib/showroomAppeals.js'
import { getHatPresentationMap } from '../_lib/hatPresentation.js'
import { authorizedScreeningWorker, screenQueuedMedia } from '../_lib/showroomMediaScreening.js'
import {
  SHOWROOM_SQL_CONTACT_PATTERN,
  decodeShowroomCursor,
  encodeShowroomCursor,
} from '../_lib/showroomEligibility.js'

const VIEWS = new Set(['for_you', 'trending', 'new', 'near'])
const PAGE_SIZE = 24

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Sign in to report a listing.' })
      const body = await readBody(req)
      if (body?.action === 'report') return json(res, 200, await reportShowroomHat(session.sub, body.hat_id, body.reason))
      if (body?.action === 'appeal') return json(res, 201, await submitShowroomAppeal(session.sub, body.hat_id, body.explanation))
      return json(res, 400, { error: 'Unknown Showroom action.' })
    } catch (error) {
      if (!error.status) console.error('Showroom report failed:', error)
      return json(res, error.status || 500, { error: error.status ? error.message : 'Could not submit the report.' })
    }
  }
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST'])
  res.setHeader('Cache-Control', 'private, no-store')

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    // A signed background worker shares this existing serverless endpoint.
    if (url.searchParams.get('worker') === '1') {
      if (!(await authorizedScreeningWorker(req.headers.authorization))) return json(res, 401, { error: 'Unauthorized worker.' })
      return json(res, 200, await screenQueuedMedia())
    }
    const session = getSessionUser(req)
    if (url.searchParams.get('action') === 'my_moderation') {
      if (!session?.sub) return json(res, 401, { error: 'Sign in to see your moderation status.' })
      return json(res, 200, await myShowroomModeration(session.sub))
    }
    const view = url.searchParams.get('view') || 'for_you'
    if (!VIEWS.has(view)) return json(res, 400, { error: 'Unknown Showroom view.' })
    const category = String(url.searchParams.get('category') || '').trim().slice(0, 80)
    const search = String(url.searchParams.get('search') || '').trim().slice(0, 100)
    const cursor = decodeShowroomCursor(url.searchParams.get('cursor'))

    // Location is scoped to the signed-in user; the browser cannot request
    // somebody else's LGA merely by supplying a query-string parameter.
    let nearLga = null
    if (view === 'near' && session?.sub) {
      const { rows } = await query('SELECT lga FROM users WHERE id = $1', [session.sub])
      nearLga = String(rows[0]?.lga || '').trim() || null
    }

    const params = [
      category || null,
      search || null,
      view === 'near' ? nearLga : null,
      cursor?.score ?? null,
      cursor?.date ?? null,
      cursor?.id ?? null,
      view,
      SHOWROOM_SQL_CONTACT_PATTERN,
      PAGE_SIZE + 1,
    ]

    // Server-side eligibility: only active talent Hats with media and no
    // obvious off-platform contact instructions in their visible text.
    // This is a first-pass text gate, not an OCR/content safety classifier.
    // Keyset pagination avoids increasing OFFSET scans as the feed grows.
    const { rows: candidates } = await query(
      `WITH eligible AS (
         SELECT h.*, u.avatar_url AS owner_avatar, u.full_name AS owner_full_name,
                u.role AS owner_role, u.company_suffix AS owner_company_suffix,
                CASE WHEN $7 = 'new' THEN 0
                  WHEN $7 = 'trending' THEN
                    (LEAST(GREATEST(COALESCE(h.likes, 0), 0), 10000) * 5
                     + LEAST(GREATEST(COALESCE(h.views, 0), 0), 100000) / 10
                     + LEAST(GREATEST(COALESCE(h.bookings, 0), 0), 1000) * 15
                     + CASE WHEN h.created_at > NOW() - interval '7 days' THEN 50 ELSE 0 END)
                  ELSE
                    (COALESCE(h.orbit_score, 0)
                     + LEAST(GREATEST(COALESCE(h.likes, 0), 0), 10000) * 3
                     + LEAST(GREATEST(COALESCE(h.bookings, 0), 0), 1000) * 20
                     + CASE WHEN h.created_at > NOW() - interval '14 days' THEN 35 ELSE 0 END)
                END::int AS rank_score
         FROM hats h
         JOIN users u ON u.id = h.user_id
         WHERE h.active = true AND h.role = 'talent'
           AND EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id = h.id)
           AND NOT EXISTS (
             SELECT 1 FROM hat_media scanned WHERE scanned.hat_id = h.id
               AND scanned.screening_status IN ('pending', 'processing', 'held', 'rejected')
           )
           -- Flagged posts are paused from discovery pending exceptional review,
           -- but existing Hats/deals remain intact and can be appealed.
           AND NOT EXISTS (
             SELECT 1 FROM showroom_review_state s
             WHERE s.hat_id = h.id AND s.status IN ('flagged', 'restricted')
           )
           AND NOT (COALESCE(h.hat_title, '') || ' ' || COALESCE(h.hat_name, '') || ' ' || COALESCE(h.motto, '') ~* $8)
           AND NOT EXISTS (
             SELECT 1 FROM hat_media m
             WHERE m.hat_id = h.id AND COALESCE(m.caption, '') ~* $8
           )
           AND ($1::text IS NULL OR h.category = $1)
           AND ($2::text IS NULL OR h.hat_title ILIKE '%' || $2 || '%'
             OR h.username ILIKE '%' || $2 || '%'
             OR h.category ILIKE '%' || $2 || '%')
           AND ($7 <> 'near' OR ($3::text IS NOT NULL AND LOWER(COALESCE(NULLIF(h.lga, ''), u.lga, '')) = LOWER($3)))
       )
       SELECT * FROM eligible
       WHERE ($4::int IS NULL OR (rank_score, created_at, id) < ($4::int, $5::timestamptz, $6::uuid))
       ORDER BY rank_score DESC, created_at DESC, id DESC
       LIMIT $9`,
      params,
    )

    const hats = candidates.slice(0, PAGE_SIZE)
    const ids = hats.map((h) => h.id)
    const presentations = await getHatPresentationMap(ids)
    const mediaByHat = {}
    if (ids.length) {
      const { rows: media } = await query(
        'SELECT id, hat_id, url, public_id, type, caption, screening_status FROM hat_media WHERE hat_id = ANY($1::uuid[]) ORDER BY created_at, id',
        [ids],
      )
      for (const m of media) {
        if (!mediaByHat[m.hat_id]) mediaByHat[m.hat_id] = []
        mediaByHat[m.hat_id].push(m)
      }
    }
    let liked = new Set()
    if (session?.sub && ids.length) {
      try {
        const { rows } = await query('SELECT hat_id FROM hat_likes WHERE user_id = $1 AND hat_id = ANY($2::uuid[])', [session.sub, ids])
        liked = new Set(rows.map((row) => row.hat_id))
      } catch (error) {
        console.error('Showroom likes lookup failed:', error)
      }
    }

    const { rows: categories } = await query('SELECT id, name FROM categories ORDER BY name')
    return json(res, 200, {
      hats: hats.map((h, index) => ({
        ...h,
        media: mediaByHat[h.id] || [],
        bento_accent: presentations[h.id]?.accent || 'electric',
        showroom_template: presentations[h.id]?.template || 'minimal',
        liked_by_me: liked.has(h.id),
        isHost: !cursor && index === 0 && view === 'for_you',
      })),
      categories,
      view,
      nearbyAvailable: view !== 'near' || Boolean(nearLga),
      nextCursor: candidates.length > PAGE_SIZE
        ? encodeShowroomCursor({
            score: hats[hats.length - 1].rank_score,
            created_at: hats[hats.length - 1].created_at,
            id: hats[hats.length - 1].id,
          })
        : null,
    })
  } catch (err) {
    if (!err.status) console.error('showroom discovery error:', err)
    return json(res, err.status || 500, { error: err.status ? err.message : 'Failed to load showroom' })
  }
}
