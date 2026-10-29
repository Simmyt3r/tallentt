const fail = message => Object.assign(new Error(message), {status: 400})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeTalentCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Invalid talent card.')
  const mainTalent = typeof value.mainTalent === 'string' ? value.mainTalent.trim() : ''
  if (mainTalent.length > 100) throw fail('Choose a valid main talent.')
  const workModes = value.workModes ?? []
  if (!Array.isArray(workModes) || workModes.some(mode => !['Gigs', 'Full-time'].includes(mode))) throw fail('Choose Gigs or Full-time.')
  const availability = value.availability ?? 'not-specified'
  if (!['not-specified', 'available', 'busy', 'not-looking'].includes(availability)) throw fail('Choose a valid availability.')
  const featuredMedia = value.featuredMedia ?? []
  if (!Array.isArray(featuredMedia) || featuredMedia.length > 3 || featuredMedia.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(featuredMedia).size !== featuredMedia.length) throw fail('Choose up to three different portfolio works.')
  const salary = value.salary ?? {}
  const visibility = salary.visibility ?? 'private'
  if (!['private', 'tier', 'range'].includes(visibility)) throw fail('Choose salary expectation visibility.')
  const tier = salary.tier ?? ''
  if (!['', 'Entry', 'Mid', 'Senior', 'Top'].includes(tier)) throw fail('Choose a salary tier.')
  const amount = v => v === '' || v == null ? null : Number(v)
  const min = amount(salary.min), max = amount(salary.max)
  if ([min, max].some(v => v !== null && (!Number.isSafeInteger(v) || v < 1 || v > 2_000_000_000))) throw fail('Salary expectations must be positive whole amounts.')
  if ((min === null) !== (max === null) || (min !== null && min > max)) throw fail('Enter a complete salary range with the minimum first.')
  if (visibility === 'range' && min === null) throw fail('Enter your public salary expectation range.')
  if (visibility === 'tier' && !tier) throw fail('Choose your public salary tier.')
  return {mainTalent, workModes: [...new Set(workModes)], availability, featuredMedia, salary: {visibility, tier, min, max}}
}

// An explicit projection: private values must never reach a public response.
export function publicTalentCard(value = {}) {
  const salary = value?.salary || {}
  return {
    mainTalent: value?.mainTalent || '', workModes: value?.workModes || [],
    availability: value?.availability || 'not-specified', featuredMedia: value?.featuredMedia || [],
    salary: salary.visibility === 'range'
      ? {visibility: 'range', min: salary.min, max: salary.max}
      : salary.visibility === 'tier' ? {visibility: 'tier', tier: salary.tier}
        : {visibility: 'private'},
  }
}

export async function validateTalentCardOwnership(client, userId, card) {
  if (card.mainTalent) {
    const {rows} = await client.query("SELECT 1 FROM hats WHERE user_id=$1 AND active=TRUE AND role='talent' AND category=$2 LIMIT 1", [userId, card.mainTalent])
    if (!rows.length) throw fail('Your main talent must match an active Talent Hat category.')
  }
  if (card.featuredMedia.length) {
    const {rows} = await client.query(`SELECT m.id FROM hat_media m JOIN hats h ON h.id=m.hat_id
      WHERE h.user_id=$1 AND h.active=TRUE AND h.role='talent' AND m.type IN ('image','video') AND m.id=ANY($2::uuid[])`, [userId, card.featuredMedia])
    if (rows.length !== card.featuredMedia.length) throw fail('Featured works must belong to your active Talent Hats.')
  }
}
