// First-pass deterministic text eligibility checks for Showroom.
// This is deliberately NOT OCR or image/video moderation.
export const SHOWROOM_SQL_CONTACT_PATTERN =
  '(whats?app|telegram|wa[.]me|t[.]me|https?://|www[.]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|(^|[^[:digit:]])[+]?[[:digit:]][[:digit:] .()-]{8,}[[:digit:]]([^[:digit:]]|$))'

const linkOrEmail = /(whats?app|telegram|wa\.me|t\.me|https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
const possiblePhone = /\+?\d[\d\s().-]{8,}\d/g

export function containsContactBypass(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  if (linkOrEmail.test(value)) return true
  const numbers = value.match(possiblePhone) || []
  return numbers.some((match) => {
    const digits = match.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  })
}

export function showroomTextIssue({ title, motto, media } = {}) {
  const parts = [title, motto]
  if (Array.isArray(media)) parts.push(...media.map((item) => item?.caption))
  return parts.some(containsContactBypass)
    ? 'Remove contact numbers, email addresses, website links and messaging handles from Showroom text. Use Deals Chat after a deal is accepted.'
    : null
}

export function encodeShowroomCursor({ score, created_at, id }) {
  return Buffer.from(JSON.stringify([Number(score), new Date(created_at).toISOString(), id])).toString('base64url')
}

export function decodeShowroomCursor(cursor) {
  if (!cursor) return null
  try {
    if (typeof cursor !== 'string' || cursor.length > 300) throw new Error()
    const [score, date, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!Number.isFinite(score) || !Number.isInteger(score) || !Number.isFinite(Date.parse(date)) ||
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Error()
    return { score, date, id }
  } catch {
    const err = new Error('Invalid Showroom pagination cursor.')
    err.status = 400
    throw err
  }
}
