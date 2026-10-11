// Keep landing behavior deterministic and user-specific.
// A remembered explicit choice wins; otherwise busy client accounts start in Bento.
export const LANDING_STORAGE_PREFIX = 'chombutar:lastLanding:'
export const LANDING_DESTINATIONS = Object.freeze({ showroom: '/showroom', bento: '/bento' })

export function landingPreferenceKey(userId) {
  return `${LANDING_STORAGE_PREFIX}${userId}`
}

export function normalizeLanding(value) {
  return value === 'showroom' || value === 'bento' ? value : null
}

export function decideLanding({ remembered, role, hasActiveClientDeals = false } = {}) {
  const saved = normalizeLanding(remembered)
  if (saved) return LANDING_DESTINATIONS[saved]
  if ((role === 'client' || role === 'dual') && hasActiveClientDeals) {
    return LANDING_DESTINATIONS.bento
  }
  return LANDING_DESTINATIONS.showroom
}
