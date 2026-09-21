// Path: src/lib/profile.js
// Shared, pure helpers for the Profile pages/components. Kept framework-
// free (no React) so ProfileHeader, EditProfileForm, and
// ProfileCompletenessCard all compute the same thing the same way.

// Mirrors the CHECK constraint on users.company_suffix (see
// db/schema.sql / db/patch-profile-ux.sql). Keep these two lists in sync.
export const COMPANY_SUFFIXES = ['Ltd.', 'Limited', 'Inc.', 'LLC', 'PLC', 'LLP', 'Corp.']

// The platform's identity convention (see the Profile UX brief): Talent
// (and dual, who are still fundamentally a person with a personal
// username) get the `^username` handle; Client gets their actual
// business identity. This is display-only — never used to infer role
// (see api/_lib/*, which always reads the authenticated `role` column).
export function isBusinessIdentity(role) {
  return role === 'client'
}

// ── Identity display ─────────────────────────────────────────────────────
// The single place that decides how a person is *shown* anywhere in the app
// (cards, modals, Showroom, Profile, lists, Live, Admin) and where that
// identity links to. It is display-only: nothing here decides what someone is
// allowed to do (api/_lib/* always reads the authenticated `role` column), and
// nothing here changes what is stored — usernames are saved, looked up and
// routed raw, never with a `^`.
//
//   Talent (and dual)            Client
//   Full Name                    Business Name Ltd.
//   ^username                    username
//
// Every identity — avatar, name and username — links to `/profile/:username`
// (see getProfilePath). Components render this through <UserIdentity />
// (src/components/UserIdentity.jsx) rather than formatting names themselves.

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')

// Legal-entity endings that mean "this name already carries its suffix". Wider
// than COMPANY_SUFFIXES on purpose: a name typed as "Acme Corporation" or
// "Silabs Limited" must not gain a second suffix just because the stored
// suffix is spelled differently ("Corp." / "Ltd.").
const LEGAL_SUFFIX_WORDS = ['Ltd', 'Limited', 'Inc', 'Incorporated', 'LLC', 'PLC', 'LLP', 'Corp', 'Corporation']
const ENDS_WITH_LEGAL_SUFFIX = new RegExp(`(?:^|[\\s,])(?:${LEGAL_SUFFIX_WORDS.join('|')})\\.?$`, 'i')

// A username as it is stored: no `^` (Talent display prefix) and no `@` (the
// old display prefix / something a person types out of habit). Real usernames
// can never contain either (see USERNAME_RE in api/auth/index.js), so this only
// ever strips decoration. Also used to clean search input, so `^simeon`
// searches for `simeon`.
export function normalizeUsername(value) {
  return cleanText(value).replace(/^[\^@]+/, '').trim()
}

// `^simeon` — the Talent handle. Never doubled (`^^simeon`), never
// `^undefined`: no username means no handle at all.
export function formatTalentUsername(username) {
  const raw = normalizeUsername(username)
  return raw ? `^${raw}` : ''
}

// Clients show their username exactly as stored — no `^`.
export function formatClientUsername(username) {
  return normalizeUsername(username)
}

export function hasLegalSuffix(name) {
  return ENDS_WITH_LEGAL_SUFFIX.test(cleanText(name))
}

// Builds the Client business-identity line: the stored name plus the stored
// suffix, appended only when the name doesn't already end in a legal suffix —
// so "Silabs Ltd." never becomes "Silabs Ltd. Ltd.". Never invents a suffix
// that isn't on file, and never renders a lone suffix with no name.
export function formatBusinessName(fullName, companySuffix) {
  const name = cleanText(fullName)
  const suffix = cleanText(companySuffix)
  if (!name || !suffix || hasLegalSuffix(name)) return name
  return `${name} ${suffix}`
}

// Any of the shapes the API hands back for a person — a user/profile object
// (`fullName`, `avatarUrl`, `companySuffix`), a database-style row (`full_name`,
// `avatar_url`, `company_suffix`), or just a username string — as one
// predictable object with only clean strings ('' when unknown, never
// undefined/null).
export function resolveIdentity(source) {
  if (typeof source === 'string') {
    return { fullName: '', username: normalizeUsername(source), role: '', companySuffix: '', avatarUrl: '' }
  }
  const s = source || {}
  return {
    fullName: cleanText(s.fullName) || cleanText(s.full_name),
    username: normalizeUsername(s.username),
    role: cleanText(s.role).toLowerCase(),
    companySuffix: cleanText(s.companySuffix) || cleanText(s.company_suffix),
    avatarUrl: cleanText(s.avatarUrl) || cleanText(s.avatar_url),
  }
}

// Rows that carry two people at once name their columns with a prefix
// (`talent_username`, `peer_full_name`, `host_avatar_url`, ...). This reads one
// of them as an identity.
export function identityFromRow(row, prefix) {
  const r = row || {}
  const get = (field) => r[`${prefix}_${field}`]
  return resolveIdentity({
    username: get('username'),
    fullName: get('full_name'),
    role: get('role'),
    companySuffix: get('company_suffix'),
    avatarUrl: cleanText(get('avatar')) || get('avatar_url'),
  })
}

// A hat's owner. `owner_role` is the *account* role (which can be 'dual'); a
// list that doesn't carry it falls back to the hat's own role, which is the
// best signal left for whether this person is presenting as a business.
export function identityFromHat(hat) {
  const h = hat || {}
  return resolveIdentity({
    username: cleanText(h.owner_username) || h.username,
    fullName: h.owner_full_name,
    role: cleanText(h.owner_role) || h.role,
    companySuffix: h.owner_company_suffix,
    avatarUrl: cleanText(h.owner_avatar) || h.avatar_url,
  })
}

// The main line: Talent's full name, a Client's business name (with its legal
// suffix). Falls back to the username — never to a blank or "undefined" — when
// there is no name on file.
export function getPrimaryIdentity(user) {
  const u = resolveIdentity(user)
  if (isBusinessIdentity(u.role)) {
    return formatBusinessName(u.fullName, u.companySuffix) || formatClientUsername(u.username)
  }
  return u.fullName || formatTalentUsername(u.username)
}

// The username as it is displayed for this kind of account — `^simeon` for
// Talent, `silabs` for Client — on its own, for places that show only a handle.
export function getUsernameLabel(user) {
  const u = resolveIdentity(user)
  return isBusinessIdentity(u.role) ? formatClientUsername(u.username) : formatTalentUsername(u.username)
}

// The handle line under the main line. Empty when there is no username, or
// when it would only repeat the main line (a person with no name on file
// already shows their handle as the main line).
export function getSecondaryIdentity(user) {
  const handle = getUsernameLabel(user)
  return handle && handle !== getPrimaryIdentity(user) ? handle : ''
}

// Where an identity links to — always the raw stored username, exactly as the
// existing public-profile route expects it. null when there is no username to
// link to, so callers can render plain text rather than a dead link.
export function getProfilePath(user) {
  const { username } = resolveIdentity(user)
  return username ? `/profile/${encodeURIComponent(username)}` : null
}

// Real reviews don't exist yet anywhere in this app (see
// api/users/[username].js) — this only ever returns non-null once a hat
// genuinely has a rating on file, so the UI has an honest "no reviews
// yet" default rather than a fabricated star count.
export function formatRatingSummary(rating, ratedHatsCount) {
  if (!ratedHatsCount) return null
  return { rating: Number(rating).toFixed(1), count: ratedHatsCount }
}

const TALENT_COMPLETENESS_ITEMS = [
  { key: 'avatar', label: 'Add a profile photo', test: (u) => !!u.avatarUrl },
  { key: 'headline', label: 'Add a professional headline', test: (u) => !!u.headline?.trim() },
  { key: 'bio', label: 'Write a short About', test: (u) => !!u.bio?.trim() },
  { key: 'location', label: 'Add your location', test: (u) => !!(u.location?.trim() || (u.lga && u.country)) },
  { key: 'skills', label: 'Add your skills', test: (u, ctx) => ctx.skillsCount > 0 },
  { key: 'portfolio', label: 'Add portfolio media', test: (u, ctx) => ctx.portfolioCount > 0 },
]

const CLIENT_COMPLETENESS_ITEMS = [
  { key: 'avatar', label: 'Add a logo or photo', test: (u) => !!u.avatarUrl },
  { key: 'business_name', label: 'Add your business name', test: (u) => !!u.fullName?.trim() },
  { key: 'industry', label: 'Add your industry', test: (u, ctx) => ctx.industryCount > 0 },
  { key: 'bio', label: 'Write a short About', test: (u) => !!u.bio?.trim() },
  { key: 'location', label: 'Add your location', test: (u) => !!(u.location?.trim() || (u.lga && u.country)) },
  { key: 'business_details', label: 'Add your business suffix (Ltd., Inc., ...)', test: (u) => !!u.companySuffix },
]

// Real, field-driven completeness — never an arbitrary/decorative number
// (see the Profile UX brief, "Completeness must be real"). Returns
// { percent, missing } where `missing` is the next 1-3 concrete
// improvements, in the fixed item order above, so the guidance doesn't
// overwhelm with a full checklist.
export function computeProfileCompleteness({ role, user, skillsCount = 0, industryCount = 0, portfolioCount = 0 }) {
  const items = isBusinessIdentity(role) ? CLIENT_COMPLETENESS_ITEMS : TALENT_COMPLETENESS_ITEMS
  const ctx = { skillsCount, industryCount, portfolioCount }
  const results = items.map((item) => ({ ...item, done: Boolean(item.test(user || {}, ctx)) }))
  const doneCount = results.filter((r) => r.done).length
  const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0
  const missing = results.filter((r) => !r.done).slice(0, 3).map((r) => r.label)
  return { percent, missing }
}