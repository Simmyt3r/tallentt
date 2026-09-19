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

// Builds the Client business-identity line: full_name plus a stored
// suffix, appended only if the name doesn't already end with it (case-
// insensitive, ignoring a trailing period) — so "Silabs Ltd." never
// becomes "Silabs Ltd. Ltd.". Never fabricates a suffix that isn't on
// file.
export function formatBusinessName(fullName, companySuffix) {
  const name = (fullName || '').trim()
  if (!companySuffix) return name
  const bare = companySuffix.replace(/\.$/, '').toLowerCase()
  const nameLower = name.toLowerCase()
  if (nameLower.endsWith(companySuffix.toLowerCase()) || nameLower.endsWith(bare)) {
    return name
  }
  return `${name} ${companySuffix}`
}

// The one line rendered under the avatar in the header — `^simeon` for
// Talent/dual, the business identity for Client.
export function formatIdentityLine({ role, fullName, username, companySuffix }) {
  if (isBusinessIdentity(role)) return formatBusinessName(fullName, companySuffix)
  return `^${username || ''}`
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