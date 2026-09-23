export function bookingError(status, message) {
  return Object.assign(new Error(message), { status })
}

export function requireBookingId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw bookingError(400, 'A valid booking ID is required.')
  }
  return value
}

export function requireAmount(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw bookingError(400, 'Enter a positive amount in whole naira.')
  }
  return value
}

export function canShareContacts(escrow) {
  return escrow.contacts_unlocked === true && !['cancelled', 'refunded'].includes(escrow.status)
}

export function assertPriceEditable(escrow) {
  if (escrow.status !== 'not_funded' || escrow.checkout_locked_at) {
    throw bookingError(409, 'The price is locked for payment. This booking can no longer be negotiated.')
  }
}

export function assertNegotiable(escrow) {
  assertPriceEditable(escrow)
  if (!escrow.price_negotiable) throw bookingError(409, 'This hat has a fixed, non-negotiable price.')
}

export function assertExpectedAmount(escrow, expected) {
  if (requireAmount(expected) !== Number(escrow.amount)) {
    throw bookingError(409, 'The booking price changed. Refresh and review the current amount before paying.')
  }
}

// This is a text filter, not a promise to detect every coded contact detail.
// Normalize common obfuscations before checking; never store rejected content.
export function containsContactDetails(value) {
  let text = value.normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu, '').toLowerCase()
  text = text.replace(/[٠-٩۰-۹]/g, (n) => String(n.charCodeAt(0) - (n <= '٩' ? 0x660 : 0x6f0)))
  text = text.replace(/\s*(?:\[at\]|\(at\)|\bat\b)\s*/g, '@')
    .replace(/\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*/g, '.')
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (word) => String(words.indexOf(word)))
  return /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\.[a-z]{2,}/i.test(text)
    || /(?:https?:|www\s*\.|mailto:|tel:|wa\.me|t\.me)/i.test(text)
    || /\b[a-z0-9][a-z0-9-]*\.(?:[a-z]{2,})(?:\b|\/)/i.test(text)
    || /(?:^|\s)@[a-z0-9_][a-z0-9_.-]{1,}/i.test(text)
    || /(?:\d[\s().,+/\-_:]*){7,}\d/.test(text)
    || /\b(?:call me|my number|dm me|hmu|reach me|message me on|add me on)\b/i.test(text)
}

export function messageText(value, escrow, required = true) {
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) {
    throw bookingError(400, 'Messages must contain 1 to 2,000 characters.')
  }
  const text = value.trim()
  if (!canShareContacts(escrow) && containsContactDetails(text)) {
    throw bookingError(422, 'Contact details and external links can only be shared after the deal is accepted. Remove them to send this message.')
  }
  return text
}
