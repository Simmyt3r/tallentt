// Orbit is a non-negative activity total with no display ceiling.
export function fullOrbitScore(raw) {
  if (raw == null || raw === '' || !Number.isFinite(Number(raw))) return null
  return Math.max(0, Number(raw)).toFixed(1)
}
