export const HAT_TYPES = ['Full-time', 'Part-time', 'Freelance', 'Contract', 'One-Off']
export const DELIVERY_MODES = ['Physical', 'Remote', 'Hybrid']
export const RATE_UNITS = ['hr', 'day', 'week', 'month', 'year', 'custom']
export const PRICE_TYPES = ['fixed', 'range']
export const HAT_ROLES = ['talent', 'client']

// Text limits shared with the Create/Edit Hat form (src/lib/hatForm.js).
// The description shown in the form is stored in `hats.motto`, whose column
// has CHECK (char_length(motto) <= 80) — see db/schema.sql.
export const HAT_TITLE_MAX = 80
export const HAT_DESCRIPTION_MAX = 80

// rate / price_min / price_max are 32-bit INT columns. Anything larger (or
// fractional) used to surface as a raw database error; reject it up front.
export const MAX_PRICE = 2_000_000_000

function validateAmount(value, missingMessage) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return { error: missingMessage }
  if (!Number.isInteger(amount)) return { error: 'Enter a whole-number amount.' }
  if (amount > MAX_PRICE) return { error: `Enter an amount of ${MAX_PRICE.toLocaleString('en-US')} or less.` }
  return { amount }
}

/**
 * Validates + normalizes the pricing block of a hat submission.
 * Returns { ok: true, fields } or { ok: false, error }.
 * `fields` always carries all six pricing columns (nulling out whichever
 * side of fixed/range isn't active) so callers can spread it straight into
 * an INSERT/UPDATE without extra branching.
 *
 * `price_negotiable` is the single canonical "this price can be negotiated"
 * flag — booking/negotiation (api/_lib/bookingRules.js) already keys off it.
 * It is honoured for BOTH price types: a fixed hat with price_negotiable set
 * is "a starting price, open to negotiation"; the amount stays in `rate`,
 * which escrow creation already reads for non-range hats.
 */
export function normalizePricing(body) {
  const price_type = PRICE_TYPES.includes(body.price_type) ? body.price_type : 'fixed'

  if (price_type === 'fixed') {
    const checked = validateAmount(body.rate, 'Enter a fixed rate greater than 0.')
    if (checked.error) return { ok: false, error: checked.error }
    const rate = checked.amount
    const rate_unit = RATE_UNITS.includes(body.rate_unit) ? body.rate_unit : null
    if (!rate_unit) return { ok: false, error: 'Select a rate unit (per hour, day, etc).' }
    if (rate_unit === 'custom' && !String(body.rate_unit_custom || '').trim()) {
      return { ok: false, error: 'Enter a label for the custom rate unit.' }
    }
    return {
      ok: true,
      fields: {
        price_type,
        rate,
        rate_unit,
        rate_unit_custom: rate_unit === 'custom' ? String(body.rate_unit_custom).trim().slice(0, 24) : null,
        price_min: null,
        price_max: null,
        price_negotiable: Boolean(body.price_negotiable),
      },
    }
  }

  // range
  const min = validateAmount(body.price_min, 'Enter a minimum price greater than 0.')
  if (min.error) return { ok: false, error: min.error }
  const price_min = min.amount
  const max = validateAmount(body.price_max, 'Enter a maximum price greater than or equal to the minimum.')
  if (max.error) return { ok: false, error: max.error }
  const price_max = max.amount
  if (price_max < price_min) {
    return { ok: false, error: 'Enter a maximum price greater than or equal to the minimum.' }
  }
  return {
    ok: true,
    fields: {
      price_type,
      rate: null,
      rate_unit: null,
      rate_unit_custom: null,
      price_min,
      price_max,
      price_negotiable: Boolean(body.price_negotiable),
    },
  }
}

/**
 * Decides which role a NEW hat gets. The account's role is authoritative —
 * a browser-supplied `role` is only ever a request, never a grant:
 *   talent account → talent hat ("Seeking")
 *   client account → client hat ("Hiring")
 *   dual account   → may pick either; defaults to talent when omitted (the
 *                    historical default), anything else is rejected
 * Returns { ok: true, role } or { ok: false, status, error }.
 */
export function resolveHatRole(accountRole, requestedRole) {
  const requested = requestedRole == null || requestedRole === '' ? null : requestedRole

  if (accountRole === 'talent' || accountRole === 'client') {
    if (requested && requested !== accountRole) {
      const label = accountRole === 'talent' ? 'Talent' : 'Client'
      return { ok: false, status: 403, error: `Your account can only create ${label} Hats.` }
    }
    return { ok: true, role: accountRole }
  }

  if (accountRole === 'dual') {
    if (requested === null) return { ok: true, role: 'talent' }
    if (!HAT_ROLES.includes(requested)) {
      return { ok: false, status: 400, error: 'Choose whether this Hat is for Talent or Client.' }
    }
    return { ok: true, role: requested }
  }

  return { ok: false, status: 403, error: 'Your account is not allowed to create Hats.' }
}

/** Human-readable price line, mirrors the frontend preview. */
export function formatPrice(hat, currency) {
  const fmt = (n) => `${currency === 'NGN' ? '₦' : currency + ' '}${Number(n).toLocaleString()}`
  if (hat.price_type === 'range') {
    const base = `${fmt(hat.price_min)} – ${fmt(hat.price_max)}`
    return hat.price_negotiable ? `${base} (negotiable)` : base
  }
  const unit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : `/${hat.rate_unit}`
  const base = `${fmt(hat.rate)} ${unit || ''}`.trim()
  return hat.price_negotiable ? `${base} (negotiable)` : base
}