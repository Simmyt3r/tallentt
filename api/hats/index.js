import { query } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody, isVerifiedName } from '../_lib/http.js'
import { computeOrbitScore } from '../_lib/orbitScore.js'
import { HAT_TYPES, DELIVERY_MODES, normalizePricing } from '../_lib/hatFields.js'

async function attachMedia(hats) {
  if (!hats.length) return hats
  const ids = hats.map((h) => h.id)
  const { rows } = await query(
    `SELECT id, hat_id, url, public_id, type, caption FROM hat_media WHERE hat_id = ANY($1::uuid[])`,
    [ids],
  )
  const byHat = {}
  for (const m of rows) {
    if (!byHat[m.hat_id]) byHat[m.hat_id] = []
    byHat[m.hat_id].push(m)
  }
  return hats.map((h) => ({
    ...h,
    media: byHat[h.id] || [],
    confidence: h.orbit_score, // alias for UI
  }))
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const role = url.searchParams.get('role')

      // GET /api/hats?applied=1 — "My Applications": every hat the
      // signed-in user has applied to, with their application status.
      // Folded into this same function (Vercel Hobby's 12-function cap)
      // rather than a dedicated /api/applications endpoint.
      if (url.searchParams.get('applied') === '1') {
        const session = getSessionUser(req)
        if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })
        try {
          const { rows } = await query(
            `SELECT a.id as application_id, a.status, a.message, a.created_at as applied_at,
                    h.id as hat_id, h.hat_title, h.category, h.role as hat_role,
                    h.price_type, h.rate, h.price_min, h.price_max, h.currency,
                    h.rate_unit, h.rate_unit_custom,
                    u.id as owner_id, u.username as owner_username,
                    u.full_name as owner_full_name, u.avatar_url as owner_avatar,
                    (SELECT m.url FROM hat_media m WHERE m.hat_id = h.id ORDER BY m.created_at LIMIT 1) as hat_thumbnail
             FROM applications a
             JOIN hats h ON h.id = a.hat_id
             LEFT JOIN users u ON u.id = h.user_id
             WHERE a.applicant_id = $1
             ORDER BY a.created_at DESC`,
            [session.sub],
          )
          return json(res, 200, { applications: rows })
        } catch (appErr) {
          console.error('my applications lookup failed (has patch-applications.sql been run?):', appErr)
          return json(res, 200, { applications: [] })
        }
      }

      // Seeking-field typeahead: GET /api/hats?suggest=1&role=talent&q=henna
      // Reuses this endpoint instead of a dedicated function (Hobby plan's
      // 12-function cap) — returns distinct hat_title values from the
      // OPPOSITE role, since that's what "seeking" suggestions draw from
      // (a client typing what they want sees phrasing talents already use,
      // and vice versa).
      if (url.searchParams.get('suggest') === '1') {
        const q = (url.searchParams.get('q') || '').trim()
        const suggestRole = role === 'talent' ? 'client' : 'talent'
        const params = [suggestRole]
        let where = `h.active = true AND h.role = $1 AND h.hat_title IS NOT NULL`
        if (q) {
          params.push(`${q}%`)
          where += ` AND h.hat_title ILIKE $2`
        }
        const { rows } = await query(
          `SELECT DISTINCT hat_title FROM hats h WHERE ${where} ORDER BY hat_title LIMIT 8`,
          params,
        )
        return json(res, 200, { suggestions: rows.map((r) => r.hat_title) })
      }

      const category = url.searchParams.get('category')
      const lga = url.searchParams.get('lga')
      const search = url.searchParams.get('search')
      const available = url.searchParams.get('available')
      const userId = url.searchParams.get('user_id')

      const clauses = ['h.active = true']
      const params = []
      let i = 1

      if (userId) {
        clauses.push(`h.user_id = $${i++}`)
        params.push(userId)
      }
      if (role && (role === 'talent' || role === 'client')) {
        clauses.push(`h.role = $${i++}`)
        params.push(role)
      }
      if (category) {
        clauses.push(`h.category = $${i++}`)
        params.push(category)
      }
      if (lga) {
        clauses.push(`h.lga ILIKE $${i++}`)
        params.push(`%${lga}%`)
      }
      if (available === 'true') {
        clauses.push('h.availability = true')
      }
      if (search) {
        clauses.push(`(h.username ILIKE $${i} OR h.hat_title ILIKE $${i} OR $${i} = ANY(h.skills))`)
        params.push(`%${search}%`)
        i++
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const { rows } = await query(
        `SELECT h.*, u.avatar_url as owner_avatar
         FROM hats h
         LEFT JOIN users u ON u.id = h.user_id
         ${where}
         ORDER BY (h.bookings + h.orbit_score + h.likes) DESC, h.created_at DESC
         LIMIT 100`,
        params,
      )
      return json(res, 200, { hats: await attachMedia(rows) })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: 'Failed to fetch hats' })
    }
  }

  if (req.method === 'POST') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      // Username always comes from the signed-in account — never re-asked on hat create
      const { rows: userRows } = await query(
        `SELECT id, username, full_name FROM users WHERE id = $1`,
        [session.sub],
      )
      if (!userRows[0]) return json(res, 401, { error: 'User not found' })
      const accountUsername = userRows[0].username

      const body = await readBody(req)
      const {
        hat_title,
        verified_name,
        category,
        skills = [],
        hat_type = 'Freelance',
        delivery_mode,
        country,
        country_flag,
        currency = 'NGN',
        lga,
        motto,
        role = 'talent', // talent hat = talent listing
        media = [],
        availability = true,
        available_from,
        available_to,
      } = body

      if (!hat_title || !category) {
        return json(res, 400, { error: 'A seeking title and category are required.' })
      }
      if (!HAT_TYPES.includes(hat_type)) {
        return json(res, 400, { error: 'Invalid hat type.' })
      }
      if (delivery_mode && !DELIVERY_MODES.includes(delivery_mode)) {
        return json(res, 400, { error: 'Invalid delivery mode.' })
      }
      if (role === 'talent' && (!media || media.length === 0)) {
        return json(res, 400, { error: 'Portfolio media is required for Talent hats' })
      }

      const pricing = normalizePricing(body)
      if (!pricing.ok) return json(res, 400, { error: pricing.error })

      const verified = isVerifiedName(verified_name)
      const skillList = Array.isArray(skills) ? skills : []
      const orbitScore = computeOrbitScore({
        mediaCount: media.length,
        isVerified: verified,
        skillsCount: skillList.length,
        hasMotto: Boolean(motto && String(motto).trim()),
        hasPrice: pricing.fields.price_type === 'fixed' ? pricing.fields.rate > 0 : pricing.fields.price_min > 0,
        availability,
        bookings: 0,
        likes: 0,
        rating: 0,
      })

      const { rows } = await query(
        `INSERT INTO hats (
          user_id, hat_title, username, verified_name, is_verified, category, skills,
          hat_type, delivery_mode, country, country_flag, currency, lga, motto,
          price_type, price_min, price_max, price_negotiable, rate, rate_unit, rate_unit_custom,
          role, availability, available_from, available_to, orbit_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING *`,
        [
          session.sub,
          hat_title,
          accountUsername,
          verified_name || null,
          verified,
          category,
          skillList,
          hat_type,
          delivery_mode || null,
          country || null,
          country_flag || null,
          currency,
          lga || null,
          motto || null,
          pricing.fields.price_type,
          pricing.fields.price_min,
          pricing.fields.price_max,
          pricing.fields.price_negotiable,
          pricing.fields.rate,
          pricing.fields.rate_unit,
          pricing.fields.rate_unit_custom,
          role,
          availability,
          available_from || null,
          available_to || null,
          orbitScore,
        ],
      )
      const hat = rows[0]

      for (const m of media) {
        if (!m.url || !m.public_id) continue
        await query(
          `INSERT INTO hat_media (hat_id, url, public_id, type, caption) VALUES ($1,$2,$3,$4,$5)`,
          [hat.id, m.url, m.public_id, m.type || 'image', m.caption || null],
        )
      }

      const withMedia = await attachMedia([hat])
      return json(res, 201, { hat: withMedia[0] })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: err.message || 'Failed to create hat' })
    }
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}