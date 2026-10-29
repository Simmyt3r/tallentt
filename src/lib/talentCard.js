export function talentGroups(hats = [], mainTalent = '') {
  return [...new Set(hats.map(h => h.category).filter(Boolean))]
    .sort((a, b) => a === mainTalent ? -1 : b === mainTalent ? 1 : a.localeCompare(b))
}

export function talentPortfolio(items, hats, selected, featured = []) {
  if (selected) {
    const ids = new Set(hats.filter(h => h.category === selected).map(h => h.id))
    return items.filter(item => ids.has(item.hat_id))
  }
  const picked = featured.map(id => items.find(item => item.id === id)).filter(Boolean)
  return [...picked, ...items.filter(item => !featured.includes(item.id))].slice(0, 3)
}

export function resolveTalent(value, groups) {
  return groups.find(group => group.toLowerCase() === (value || '').toLowerCase()) || ''
}
