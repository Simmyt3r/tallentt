/**
 * Legacy Hat activity points; completed bookings can keep adding points.
 * Completeness + social proof. Used for ranking and UI "confidence".
 */
export function computeOrbitScore({
  mediaCount = 0,
  isVerified = false,
  skillsCount = 0,
  hasMotto = false,
  hasPrice = false,
  availability = true,
  bookings = 0,
  likes = 0,
  rating = 0,
}) {
  let score = 0
  score += Math.min(mediaCount, 5) * 6
  if (isVerified) score += 12
  score += Math.min(skillsCount, 6) * 2
  if (hasMotto) score += 5
  if (hasPrice) score += 4
  if (availability) score += 4
  score += Math.max(0, Number(bookings) || 0) * 1.2
  score += Math.min(likes, 100) * 0.12
  score += Math.min(Number(rating) || 0, 5) * 1.8
  return Math.max(0, Math.round(score))
}
