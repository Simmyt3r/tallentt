import { query } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed } from '../_lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const session = getSessionUser(req)
    const { rows: hats } = await query(
      `SELECT h.*, u.avatar_url as owner_avatar, u.full_name as owner_full_name,
              u.role as owner_role, u.company_suffix as owner_company_suffix
       FROM hats h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.active = true AND h.role = 'talent'
       ORDER BY (h.bookings + h.orbit_score + h.likes) DESC
       LIMIT 12`,
    )
    const ids = hats.map((h) => h.id)
    let mediaByHat = {}
    if (ids.length) {
      const { rows: media } = await query(
        `SELECT id, hat_id, url, public_id, type, caption FROM hat_media WHERE hat_id = ANY($1::uuid[])`,
        [ids],
      )
      for (const m of media) {
        if (!mediaByHat[m.hat_id]) mediaByHat[m.hat_id] = []
        mediaByHat[m.hat_id].push(m)
      }
    }
    let likedSet = new Set()
    if (session?.sub && ids.length) {
      try {
        const { rows: likeRows } = await query(
          `SELECT hat_id FROM hat_likes WHERE user_id = $1 AND hat_id = ANY($2::uuid[])`,
          [session.sub, ids],
        )
        likedSet = new Set(likeRows.map((r) => r.hat_id))
      } catch (likeErr) {
        // hat_likes may not exist yet if db/patch-views-likes.sql hasn't
        // been run — don't let that take the whole listing down.
        console.error('liked_by_me lookup failed (has patch-views-likes.sql been run?):', likeErr)
      }
    }
    const curated = hats.map((h, i) => ({
      ...h,
      media: mediaByHat[h.id] || [],
      isHost: i === 0,
      liked_by_me: likedSet.has(h.id),
    }))

    const { rows: categories } = await query(`SELECT id, name FROM categories ORDER BY name`)
    return json(res, 200, { hats: curated, categories })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to load showroom' })
  }
}