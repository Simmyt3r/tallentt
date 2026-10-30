// Compact, deterministic engagement labels that do not round up fake counts.
export function formatEngagementCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  const count = Math.floor(n)
  if (count < 1000) return String(count)
  const render = (size, suffix) => {
    const v = Math.floor(count / size * 10) / 10
    return String(v).replace(/\.0$/, '') + suffix
  }
  if (count < 1000000) return render(1000, 'k')
  if (count < 1000000000) return render(1000000, 'm')
  return render(1000000000, 'b')
}
