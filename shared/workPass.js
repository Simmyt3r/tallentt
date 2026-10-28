// Shared deterministic policy. Levels signal historical platform activity,
// not identity verification or a guarantee of future performance.
export const WORK_PASS_DISCLAIMER = 'Verified past records do not guarantee future performance.'
export const WORK_PASS_LEVELS = Object.freeze(['Bronze', 'Silver', 'Gold', 'Diamond'])
export function workPassTier(completedJobs = 0, orbit = 0) {
  const jobs = Math.max(0, Number(completedJobs) || 0)
  const score = Math.max(0, Math.min(100, Number(orbit) || 0))
  if (jobs >= 30 && score >= 85) return 'Diamond'
  if (jobs >= 10 && score >= 65) return 'Gold'
  if (jobs >= 3 && score >= 30) return 'Silver'
  return 'Bronze'
}
export function workPassAccent(tier) {
  return { Bronze: '#AD784B', Silver: '#66788C', Gold: '#BA850A', Diamond: '#4A5CE0' }[tier] || '#AD784B'
}
