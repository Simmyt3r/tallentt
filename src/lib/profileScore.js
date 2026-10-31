// This is a presentation-only conversion. The canonical Orbit activity metric remains 0–100.
export function singleDigitOrbit(raw) {
  if (raw == null || raw === '' || !Number.isFinite(Number(raw))) return null
  return Math.min(9, Math.max(0, Math.round(Number(raw) * 9 / 100)))
}
