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
import {publicTalentCard} from '../_lib/talentCard.js'
import {publicEmploymentSummary} from '../_lib/employment.js'
import {reputationSummary} from '../_lib/reputation.js'
import { query } from '../_lib/db.js'
import {accountOrbit} from '../_lib/accountOrbit.js'
import { json, methodNotAllowed } from '../_lib/http.js'

// Only ever select/return public-safe columns here — never email, phone,
// nin_hash/nin_last4, bank_*, account_*, paystack_recipient_code,
// is_admin, or wallet balance. Those stay exclusive to api/auth's
// session-gated ?action=me.
const PUBLIC_USER_COLUMNS = `
  id, full_name, username, role, created_at, avatar_url, bio, (to_jsonb(users)->>'profile_statement') AS profile_statement, location, lga, country,
  headline, skills, industry, company_suffix, website, (to_jsonb(users)->'talent_card') AS talent_card,
  COALESCE((to_jsonb(users)->>'is_business_verified')::boolean,FALSE) AS is_business_verified
`

function toPublicProfileUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    joinedAt: row.created_at || null,
    role: row.role,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    profileStatement: row.profile_statement ?? null,
    location: row.location ?? null,
    lga: row.lga ?? null,
    country: row.country ?? null,
    headline: row.headline ?? null,
    skills: row.skills ?? [],
    talentCard: publicTalentCard(row.talent_card),
    industry: row.industry ?? [],
    companySuffix: row.company_suffix ?? null,
    website: row.website ?? null,
    isBusinessVerified: row.is_business_verified === true,
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
    // Include every active Hat so a talent category is never lost behind
    // the former 24-Hat summary limit.
    const { rows: hats } = await query(
      `SELECT id, hat_title, category, role, is_verified, rating, created_at
       FROM hats WHERE user_id = $1 AND active = true
       ORDER BY created_at DESC`,
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
        // Portfolio is spec'd as media-first images/video only (section
        // 11) — hat_media.type also allows 'audio' for a Hat's own
        // listing media, which the Portfolio grid/viewer below don't
        // render, so it's excluded here rather than reaching the UI as a
        // broken tile.
        `SELECT m.id, m.hat_id, m.url, m.public_id, m.type, m.caption, m.created_at, h.hat_title
         FROM hat_media m JOIN hats h ON h.id = m.hat_id
         WHERE m.hat_id = ANY($1::uuid[]) AND m.type IN ('image', 'video')
           AND m.screening_status IN ('legacy','passed')
         ORDER BY (m.id::text = ANY($2::text[])) DESC, m.created_at DESC, m.id
         LIMIT 60`,
        [talentHatIds, userRow.talent_card?.featuredMedia || []],
      )
      portfolio = media
    }

    // Gallery is the public, moderated picture/video feed, separate from Hat portfolio.
    // Its migration is optional; private/pending/held assets must not appear on profiles.
    let gallery = []
    const {rows:galleryStorage}=await query("SELECT to_regclass('showroom_gallery_posts') AS table_name")
    if (galleryStorage[0]?.table_name) {
      const {rows:galleryRows}=await query(`SELECT id,media_url AS url,media_type AS type,
        caption,created_at FROM showroom_gallery_posts
        WHERE author_id=$1 AND moderation_status='visible' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 60`,[userRow.id])
      gallery=galleryRows.map(item=>({...item,id:'gallery:'+item.id}))
    }

    const {rows:performanceRows}=await query(`SELECT
      COUNT(*) FILTER (WHERE talent_id=$1 AND status='released')::int AS completed_jobs,
      COUNT(*) FILTER (WHERE client_id=$1 AND status='released')::int AS successful_hires,
      COUNT(*) FILTER (WHERE work_status='disputed')::int AS open_disputes
      FROM escrows WHERE talent_id=$1 OR client_id=$1`,[userRow.id])
    return json(res, 200, {
      user: toPublicProfileUser(userRow),
      employment: await publicEmploymentSummary(userRow.id).catch(() => null),
      reputation: await reputationSummary(userRow.id).catch(() => null),
      performance: performanceRows[0],
      // Orbit is supplemental: a scoring outage must never hide a public profile.
      orbit: await accountOrbit(userRow.id).catch(() => null),
      isVerified,
      rating,
      ratedHatsCount: ratedHats.length,
      portfolio,
      gallery,
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
