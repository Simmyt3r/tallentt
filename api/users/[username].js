// Path: api/users/[username].js
// Public profile read — backs the redesigned Profile pages (own + public).
// GET only, no session required (same pattern as api/hats/index.js and
// api/showroom/index.js: those list hats without gating on auth either —
// the app's *pages* are all behind ProtectedRoute, but the API layer
// itself has never required a session for read-only listings).
//
// Deliberately a new, separate function rather than folded into
// api/auth/index.js (which already owns the *signed-in* user's own
// record) — this is a different concern (looking up *someone else's*
// public identity by username) and keeps api/auth's dispatch table from
// growing another unrelated branch. Still well under Vercel Hobby's
// 12-function cap (9 functions total after this one).
import { query } from '../_lib/db.js'
import { json, methodNotAllowed } from '../_lib/http.js'

// Only ever select/return public-safe columns here — never email, phone,
// nin_hash/nin_last4, bank_*, account_*, paystack_recipient_code,
// is_admin, or wallet balance. Those stay exclusive to api/auth's
// session-gated ?action=me.
const PUBLIC_USER_COLUMNS = `
  id, full_name, username, role, avatar_url, bio, location, lga, country,
  headline, skills, industry, company_suffix, website
`

function toPublicProfileUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    role: row.role,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    location: row.location ?? null,
    lga: row.lga ?? null,
    country: row.country ?? null,
    headline: row.headline ?? null,
    skills: row.skills ?? [],
    industry: row.industry ?? [],
    companySuffix: row.company_suffix ?? null,
    website: row.website ?? null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  const raw = req.query?.username || (req.url.match(/\/api\/users\/([^/?]+)/) || [])[1]
  const username = raw ? decodeURIComponent(raw).trim().replace(/^\^|^@/, '') : ''
  if (!username) return json(res, 400, { error: 'Missing username' })

  try {
    const { rows: userRows } = await query(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username],
    )
    const userRow = userRows[0]
    if (!userRow) return json(res, 404, { error: 'Profile not found' })

    // Active hats only — same visibility rule the rest of the app already
    // uses for listings (api/hats, api/showroom both filter active=true).
    // Capped rather than unbounded: this powers a compact "Active Hats"
    // summary, not a full listing (My Hats/Showroom already own that).
    const { rows: hats } = await query(
      `SELECT id, hat_title, category, role, is_verified, rating, created_at
       FROM hats WHERE user_id = $1 AND active = true
       ORDER BY created_at DESC LIMIT 24`,
      [userRow.id],
    )

    const isVerified = hats.some((h) => h.is_verified)

    // hats.rating is a real column, but nothing in this app ever sets it
    // to anything but its 0 default (see api/hats/[id].js's own comment:
    // "No reviews system exists"). Computed honestly here anyway — only
    // hats with a real rating (>0) count — so this quietly starts working
    // the moment a rating pipeline exists, without a fabricated number in
    // the meantime. Today this will be { rating: 0, ratedHatsCount: 0 }
    // for essentially every account, which the frontend renders as
    // "No reviews yet" rather than inventing stars.
    const ratedHats = hats.filter((h) => Number(h.rating) > 0)
    const rating = ratedHats.length
      ? ratedHats.reduce((sum, h) => sum + Number(h.rating), 0) / ratedHats.length
      : 0

    // Portfolio = hat_media aggregated across this user's active Talent
    // hats. Deliberately reuses hat_media rather than a new table — see
    // db/schema.sql; a Hat's media *is* the portfolio, Profile just
    // surfaces it across all of a Talent's hats in one place.
    const talentHatIds = hats.filter((h) => h.role === 'talent').map((h) => h.id)
    let portfolio = []
    if (talentHatIds.length) {
      const { rows: media } = await query(
        `SELECT m.id, m.hat_id, m.url, m.public_id, m.type, m.caption, m.created_at, h.hat_title
         FROM hat_media m JOIN hats h ON h.id = m.hat_id
         WHERE m.hat_id = ANY($1::uuid[])
         ORDER BY m.created_at DESC
         LIMIT 60`,
        [talentHatIds],
      )
      portfolio = media
    }

    return json(res, 200, {
      user: toPublicProfileUser(userRow),
      isVerified,
      rating,
      ratedHatsCount: ratedHats.length,
      portfolio,
      hats: {
        talent: hats.filter((h) => h.role === 'talent').map((h) => ({ id: h.id, hat_title: h.hat_title, category: h.category })),
        client: hats.filter((h) => h.role !== 'talent').map((h) => ({ id: h.id, hat_title: h.hat_title, category: h.category })),
      },
    })
  } catch (err) {
    console.error('public profile lookup failed:', err)
    return json(res, 500, { error: 'Failed to load profile' })
  }
}