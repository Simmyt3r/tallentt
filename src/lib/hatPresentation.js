export const HAT_ACCENTS = Object.freeze({
  none: { label: 'No accent', color: 'transparent' },
  electric: { label: 'Electric Blue', color: '#0A13E6' },
  coral: { label: 'Coral', color: '#DC4F36' },
  forest: { label: 'Forest', color: '#21764C' },
  violet: { label: 'Violet', color: '#744AC9' },
  rose: { label: 'Rose', color: '#C64275' },
  slate: { label: 'Slate', color: '#415167' },
  ocean: { label: 'Ocean', color: '#007F95' },
  amber: { label: 'Amber', color: '#965E09' },
})

export const SHOWROOM_TEMPLATES = Object.freeze([
  { id: 'minimal', label: 'Minimal' },
  { id: 'bold', label: 'Bold' },
  { id: 'media-first', label: 'Media First' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'dark', label: 'Dark' },
])

export const getHatAccent = (value) => HAT_ACCENTS[value]?.color ?? HAT_ACCENTS.electric.color
export const getShowroomTemplate = (value) =>
  SHOWROOM_TEMPLATES.some(item => item.id === value) ? value : 'minimal'
