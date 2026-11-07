// Public talent card projection shared by browser and API.
// IMPORTANT: no database, Node-only or serverless API imports in this module.
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
