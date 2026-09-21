// Path: src/lib/hatForm.js
//
// Pure (no React, no DOM) model for the Create/Edit Hat form: option lists,
// role-aware copy, money parsing/formatting, validation, and the mapping
// between form state <-> the existing Hat API shape (api/hats/*).
//
// Nothing here talks to the network. Field names on the API side are the
// existing ones — this file only decides how the form presents them:
//
//   priceMode 'fixed'       -> price_type 'fixed', rate,            price_negotiable false
//   priceMode 'negotiable'  -> price_type 'fixed', rate (starting), price_negotiable true
//   priceMode 'range'       -> price_type 'range', price_min/max,   price_negotiable <checkbox>
//
// `price_negotiable` is the one canonical negotiability flag (booking and
// negotiation already read it), so no second field is introduced.
//
// Limits marked "keep in sync" mirror api/_lib/hatFields.js.

export const COUNTRIES = [
  { name: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
  { name: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
  { name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
  { name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
]

export const HAT_TYPES = ['Full-time', 'Part-time', 'Freelance', 'Contract', 'One-Off'] // keep in sync
export const DELIVERY_MODES = ['Physical', 'Remote', 'Hybrid'] // keep in sync

// Stored values stay Physical / Remote / Hybrid; only the wording changes.
export const DELIVERY_OPTIONS = [
  { value: 'Physical', label: 'On-site', hint: 'In person' },
  { value: 'Remote', label: 'Remote', hint: 'Online' },
  { value: 'Hybrid', label: 'Either', hint: 'On-site or remote' },
]

export const RATE_UNITS = [
  { value: 'hr', label: 'Per hour', short: '/hr' },
  { value: 'day', label: 'Per day', short: '/day' },
  { value: 'week', label: 'Per week', short: '/week' },
  { value: 'month', label: 'Per month', short: '/month' },
  { value: 'year', label: 'Per year', short: '/year' },
  { value: 'custom', label: 'Custom…', short: '' },
]

export const PRICE_MODES = [
  { value: 'fixed', label: 'Fixed', hint: 'One set price' },
  { value: 'negotiable', label: 'Negotiable', hint: 'A starting price' },
  { value: 'range', label: 'Range', hint: 'Minimum to maximum' },
]

// Fallback shown until /api/hats?categories=1 responds — the database's
// categories table is the source of truth (see db/patch-hats-v2.sql).
export const DEFAULT_CATEGORIES = [
  'Beauty & Grooming',
  'Fashion & Styling',
  'Photography & Videography',
  'Music & Audio',
  'Performing Arts & Entertainment',
  'Visual Arts, Design & Crafts',
  'Modeling & Acting',
  'Food & Catering',
  'Events & Hospitality',
  'Health, Wellness & Fitness',
  'Home Services & Skilled Trades',
  'Tech & Digital Services',
  'Business, Admin & Professional Services',
  'Education & Training',
]

export const OTHER_CATEGORY = '__other__'

export const HAT_TITLE_MAX = 80 // keep in sync
// The description is stored in hats.motto, which the database caps at 80.
export const HAT_DESCRIPTION_MAX = 80 // keep in sync
// hats.hat_name — a short nickname for the listing, shown as the feed
// card's headline. Separate question from Title; capped shorter since it's
// meant to read as a headline, not a sentence.
export const HAT_NAME_MAX = 60 // keep in sync
export const CUSTOM_UNIT_MAX = 24
export const CUSTOM_CATEGORY_MIN = 2
export const CUSTOM_CATEGORY_MAX = 40
export const MAX_PRICE = 2_000_000_000 // keep in sync (32-bit INT columns)

/* ── Role ────────────────────────────────────────────────────────────── */

// hats.role is talent | client (dual is an account role, not a hat role).
export function normalizeHatRole(role) {
  return role === 'client' ? 'client' : 'talent'
}

/**
 * Which role a NEW hat is created under, derived from the signed-in account.
 * Talent/client accounts have no choice; only dual accounts do. The server
 * re-checks this (api/_lib/hatFields.js resolveHatRole) — this only decides
 * what the form shows.
 */
export function deriveNewHatRole(accountRole, chosenRole = 'talent') {
  if (accountRole === 'talent' || accountRole === 'client') return { role: accountRole, canChoose: false }
  return { role: normalizeHatRole(chosenRole), canChoose: accountRole === 'dual' }
}

export function roleCopy(role) {
  if (normalizeHatRole(role) === 'client') {
    return {
      role: 'client',
      listingLabel: 'Hiring',
      accountLabel: 'Client',
      headerSubtitle: "Tell people who you're looking for",
      nameQuestion: 'Give this listing a name',
      namePlaceholder: 'e.g. Weekend Wedding Package',
      nameHint: 'A short nickname — shown as the headline on your card.',
      titleQuestion: 'Who are you looking for?',
      titlePlaceholder: 'e.g. Wedding photographer',
      titleHint: 'Suggestions come from what talent already offer. Type your own too.',
      descriptionHint: 'What you need: requirements, the outcome you expect, useful conditions.',
      descriptionPlaceholder: 'e.g. Full-day coverage, edited photos within a week',
      priceQuestion: 'What is your budget?',
      priceNoun: 'budget',
      fixedLabel: 'Your budget',
      startingLabel: 'Starting budget',
      minLabel: 'Lowest budget',
      maxLabel: 'Highest budget',
      negotiableNote: 'People can propose a different budget through negotiation.',
      whenQuestion: 'When do you need them?',
      whenHint: 'The daily hours you need this talent or service.',
      openSwitch: 'Open for applications',
      openSwitchHint: 'Turn off if you are not taking applications right now.',
      mediaHint: 'Optional. Add reference images or video if it helps.',
      mediaRequired: false,
    }
  }
  return {
    role: 'talent',
    listingLabel: 'Seeking',
    accountLabel: 'Talent',
    headerSubtitle: "Tell people what you're available for",
    nameQuestion: 'Give this listing a name',
    namePlaceholder: 'e.g. Weekend Wedding Package',
    nameHint: 'A short nickname — shown as the headline on your card.',
    titleQuestion: 'What service are you available for?',
    titlePlaceholder: 'e.g. Wedding photographer',
    titleHint: 'Suggestions come from what clients are seeking. Type your own too.',
    descriptionHint: 'What you offer: experience, style, what people can expect.',
    descriptionPlaceholder: 'e.g. Candid, story-led wedding coverage',
    priceQuestion: 'What do you charge?',
    priceNoun: 'price',
    fixedLabel: 'Your price',
    startingLabel: 'Starting price',
    minLabel: 'Lowest price',
    maxLabel: 'Highest price',
    negotiableNote: 'People can request a different price through negotiation.',
    whenQuestion: 'When are you available?',
    whenHint: 'The daily hours you can take work.',
    openSwitch: 'Open for bookings',
    openSwitchHint: 'Turn off if you are not taking bookings right now.',
    mediaHint: 'Required for Talent Hats. Show your work.',
    mediaRequired: true,
  }
}

/* ── Money ───────────────────────────────────────────────────────────── */

export function countryByName(name) {
  return COUNTRIES.find((c) => c.name === name) || COUNTRIES[0]
}

/**
 * Turns whatever was typed or pasted into a clean digit string.
 * "₦25,000.50" -> "25000", "  1 200 " -> "1200", "abc" -> "", "007" -> "7".
 * Whole amounts only (the price columns are integers), no sign, no leading
 * zeros, capped at 10 digits (MAX_PRICE has 10).
 */
export function sanitizeMoneyInput(text) {
  const [whole = ''] = String(text ?? '')
    .replace(/[^\d.]/g, '')
    .split('.')
  return whole.replace(/^0+(?=\d)/, '').slice(0, 10)
}

/** True when pasted/typed text carries a minus sign — treated as a rejected negative. */
export function hasNegativeSign(text) {
  return /^\s*[-\u2212\u2013(]/.test(String(text ?? '')) || /[-\u2212]\s*[₦$£]?\s*\d/.test(String(text ?? ''))
}

/** "1234567" -> "1,234,567" (grouping only; no currency symbol). */
export function groupDigits(digits) {
  return String(digits ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Caret index inside `formatted` that sits after `digitCount` digits. */
export function caretForDigitCount(formatted, digitCount) {
  if (digitCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1
    if (seen === digitCount) return i + 1
  }
  return formatted.length
}

export function currencySymbol(currency) {
  try {
    const part = new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    return part?.value || currency
  } catch {
    return currency
  }
}

/** Display formatting only — never feed this back into state. "₦25,000". */
export function formatMoney(value, currency = 'NGN') {
  const n = Number(value)
  if (value === '' || value == null || !Number.isFinite(n)) return ''
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${currency} ${n.toLocaleString('en-US')}`
  }
}

/** "15:00" or "15:00:00" -> "3:00 PM" */
export function formatClock(value) {
  if (!value) return ''
  const [hStr, mStr = '0'] = String(value).split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`
}

// Same rule as api/_lib/http.js isVerifiedName — used only for the preview tick.
export function isVerifiedName(name) {
  if (!name) return false
  return /\b(Ltd|Plc|Corp|Inc|LLC)\b\.?$/i.test(String(name).trim())
}

/* ── Form state ──────────────────────────────────────────────────────── */

/** Fresh form for Create. Location defaults come from the signed-in profile. */
export function emptyForm(user) {
  const profileCountry = COUNTRIES.find((c) => c.name === user?.country)
  return {
    hatName: '',
    title: '',
    category: '',
    customCategory: '',
    description: '',
    skills: '',
    hatType: 'Freelance',
    verifiedName: '',

    priceMode: 'fixed',
    amount: '',
    rateUnit: 'hr',
    rateUnitCustom: '',
    priceMin: '',
    priceMax: '',
    rangeNegotiable: false,

    available: true,
    flexibleHours: true,
    availableFrom: '',
    availableTo: '',

    countryName: profileCountry ? profileCountry.name : COUNTRIES[0].name,
    city: profileCountry && user?.lga ? String(user.lga) : '',
    deliveryMode: '',
  }
}

/** Existing hat (GET /api/hats/:id) -> form state, so Edit shows what's on file. */
export function hydrateForm(hat) {
  const isRange = hat.price_type === 'range'
  return {
    hatName: hat.hat_name || '',
    title: hat.hat_title || '',
    category: hat.category || '',
    customCategory: '',
    description: hat.motto || '',
    skills: (hat.skills || []).join(', '),
    hatType: HAT_TYPES.includes(hat.hat_type) ? hat.hat_type : 'Freelance',
    verifiedName: hat.verified_name || '',

    priceMode: isRange ? 'range' : hat.price_negotiable ? 'negotiable' : 'fixed',
    amount: hat.rate != null ? String(hat.rate) : '',
    rateUnit: RATE_UNITS.some((u) => u.value === hat.rate_unit) ? hat.rate_unit : 'hr',
    rateUnitCustom: hat.rate_unit_custom || '',
    priceMin: hat.price_min != null ? String(hat.price_min) : '',
    priceMax: hat.price_max != null ? String(hat.price_max) : '',
    rangeNegotiable: isRange && Boolean(hat.price_negotiable),

    available: Boolean(hat.availability),
    flexibleHours: !hat.available_from && !hat.available_to,
    availableFrom: hat.available_from ? String(hat.available_from).slice(0, 5) : '',
    availableTo: hat.available_to ? String(hat.available_to).slice(0, 5) : '',

    countryName: countryByName(hat.country).name,
    city: hat.lga || '',
    deliveryMode: DELIVERY_MODES.includes(hat.delivery_mode) ? hat.delivery_mode : '',
  }
}

export function finalCategory(form) {
  return form.category === OTHER_CATEGORY ? form.customCategory.trim() : form.category
}

export function parseSkills(text) {
  const seen = new Set()
  const out = []
  for (const raw of String(text ?? '').split(',')) {
    const skill = raw.trim()
    const key = skill.toLowerCase()
    if (skill && !seen.has(key)) {
      seen.add(key)
      out.push(skill)
    }
  }
  return out
}

/** Stable string used to decide whether the form has unsaved changes. */
export function formSignature(form, role, mediaSig) {
  return JSON.stringify([form, role, mediaSig])
}

/** ready = ids in display order; pending = uploading/queued/failed items. */
export function mediaSignature(readyIds, pendingCount = 0) {
  return `${readyIds.join(',')}|${pendingCount}`
}

/* ── Validation ──────────────────────────────────────────────────────── */

function amountError(digits, noun, currency) {
  if (digits === '' || digits == null) return `Enter a valid ${noun}.`
  const n = Number(digits)
  if (!Number.isFinite(n)) return `Enter a valid ${noun}.`
  if (n <= 0) return `${noun[0].toUpperCase()}${noun.slice(1)} must be more than zero.`
  if (n > MAX_PRICE) return `Enter ${formatMoney(MAX_PRICE, currency)} or less.`
  return ''
}

/**
 * Returns { fieldKey: message } for everything that would block Publish/Save,
 * in the order the fields appear on the page (object key order).
 * `ctx.media` = { ready, uploading, failed } counts from the media list.
 */
export function validateForm(form, ctx) {
  const errors = {}
  const role = normalizeHatRole(ctx.role)
  const copy = roleCopy(role)
  const currency = countryByName(form.countryName).currency
  const media = ctx.media || { ready: 0, uploading: 0, failed: 0 }

  const hatName = form.hatName.trim()
  if (!hatName) errors.hatName = 'Give this listing a name.'
  else if (hatName.length > HAT_NAME_MAX) errors.hatName = `Keep the name to ${HAT_NAME_MAX} characters or fewer.`

  const title = form.title.trim()
  if (!title) errors.title = 'Title is required.'
  else if (title.length > HAT_TITLE_MAX) errors.title = `Keep the title to ${HAT_TITLE_MAX} characters or fewer.`

  if (!form.category) {
    errors.category = 'Choose a category.'
  } else if (form.category === OTHER_CATEGORY) {
    const custom = form.customCategory.trim()
    if (custom.length < CUSTOM_CATEGORY_MIN) errors.categoryCustom = `Enter a category name (at least ${CUSTOM_CATEGORY_MIN} characters).`
    else if (custom.length > CUSTOM_CATEGORY_MAX) errors.categoryCustom = `Keep the category to ${CUSTOM_CATEGORY_MAX} characters or fewer.`
  }

  if (media.uploading > 0) errors.media = 'Wait for uploads to finish.'
  else if (media.failed > 0) errors.media = 'Retry or remove the files that failed to upload.'
  else if (copy.mediaRequired && media.ready === 0) errors.media = 'Add at least one photo, video or audio file. Talent Hats need media.'

  if (form.priceMode === 'range') {
    const minMsg = amountError(form.priceMin, 'minimum', currency)
    if (minMsg) errors.priceMin = minMsg
    const maxMsg = amountError(form.priceMax, 'maximum', currency)
    if (maxMsg) errors.priceMax = maxMsg
    else if (!minMsg && Number(form.priceMax) < Number(form.priceMin)) errors.priceMax = 'Maximum must be at least the minimum.'
  } else {
    const msg = amountError(form.amount, copy.priceNoun, currency)
    if (msg) errors.amount = msg
    if (form.rateUnit === 'custom') {
      const label = form.rateUnitCustom.trim()
      if (!label) errors.rateUnitCustom = 'Enter a label, like “per event”.'
      else if (label.length > CUSTOM_UNIT_MAX) errors.rateUnitCustom = `Keep the label to ${CUSTOM_UNIT_MAX} characters or fewer.`
    }
  }

  if (!form.flexibleHours) {
    if (!form.availableFrom) errors.availableFrom = 'Select a start time.'
    if (!form.availableTo) errors.availableTo = 'Select an end time.'
    if (form.availableFrom && form.availableTo && form.availableFrom === form.availableTo) {
      errors.availableTo = "Start and end time can't be the same."
    }
  }

  if (!DELIVERY_MODES.includes(form.deliveryMode)) errors.deliveryMode = 'Choose how this will work.'
  if (form.deliveryMode === 'Physical' && !form.city.trim()) errors.city = 'Location is required for on-site work.'

  return errors
}

// element id to focus for each error key
export const FIELD_IDS = {
  hatName: 'hat-name',
  title: 'hat-title',
  category: 'hat-category',
  categoryCustom: 'hat-category-custom',
  media: 'hat-media-add',
  amount: 'hat-amount',
  rateUnitCustom: 'hat-rate-unit-custom',
  priceMin: 'hat-price-min',
  priceMax: 'hat-price-max',
  availableFrom: 'hat-available-from',
  availableTo: 'hat-available-to',
  deliveryMode: 'hat-delivery-0',
  city: 'hat-city',
}

const SUMMARY_LABELS = {
  hatName: () => 'Name',
  title: () => 'Title',
  category: () => 'Category',
  categoryCustom: () => 'Category',
  media: () => 'Media',
  amount: (copy) => (copy.priceNoun === 'budget' ? 'Budget' : 'Price'),
  rateUnitCustom: (copy) => (copy.priceNoun === 'budget' ? 'Budget' : 'Price'),
  priceMin: (copy) => (copy.priceNoun === 'budget' ? 'Budget' : 'Price'),
  priceMax: (copy) => (copy.priceNoun === 'budget' ? 'Budget' : 'Price'),
  availableFrom: () => 'Availability',
  availableTo: () => 'Availability',
  deliveryMode: () => 'How this will work',
  city: () => 'Location',
}

/** [{ label, field }] — one row per section, pointing at its first failing field. */
export function summarizeErrors(errors, role) {
  const copy = roleCopy(role)
  const seen = new Set()
  const rows = []
  for (const field of Object.keys(errors)) {
    const label = (SUMMARY_LABELS[field] || (() => field))(copy)
    if (seen.has(label)) continue
    seen.add(label)
    rows.push({ label, field })
  }
  return rows
}

/* ── Payload (form -> existing Hat API) ──────────────────────────────── */

function pricingFields(form) {
  if (form.priceMode === 'range') {
    return {
      price_type: 'range',
      price_min: Number(form.priceMin),
      price_max: Number(form.priceMax),
      price_negotiable: Boolean(form.rangeNegotiable),
    }
  }
  return {
    price_type: 'fixed',
    rate: Number(form.amount),
    rate_unit: form.rateUnit,
    rate_unit_custom: form.rateUnit === 'custom' ? form.rateUnitCustom.trim() : undefined,
    price_negotiable: form.priceMode === 'negotiable',
  }
}

/**
 * `mode`: 'create' | 'edit'.
 * `media`: the ordered [{ url, public_id, type, caption }] to save, or null to
 *          leave media untouched (an edit that didn't change media sends none,
 *          so ordinary text edits can never disturb uploaded files).
 * `role` is only sent on create, and the server treats it as a request to be
 * checked against the account, never as authority.
 */
export function buildPayload(form, { mode, role, media = null }) {
  const country = countryByName(form.countryName)
  const body = {
    hat_name: form.hatName.trim(),
    hat_title: form.title.trim(),
    category: finalCategory(form),
    skills: parseSkills(form.skills),
    hat_type: form.hatType,
    delivery_mode: form.deliveryMode,
    country: country.name,
    country_flag: country.flag,
    currency: country.currency,
    lga: form.city.trim(),
    motto: form.description.trim().slice(0, HAT_DESCRIPTION_MAX),
    availability: Boolean(form.available),
    // null clears the daily window on edit; the server keeps "absent" as "unchanged".
    available_from: form.flexibleHours ? null : form.availableFrom || null,
    available_to: form.flexibleHours ? null : form.availableTo || null,
    ...pricingFields(form),
  }
  const verified = form.verifiedName.trim()
  if (mode === 'edit') body.verified_name = verified // '' clears it
  else if (verified) body.verified_name = verified
  if (mode === 'create') body.role = normalizeHatRole(role)
  if (media) body.media = media
  return body
}

/* ── Preview ─────────────────────────────────────────────────────────── */

export function priceLine(form) {
  const currency = countryByName(form.countryName).currency
  if (form.priceMode === 'range') {
    const min = formatMoney(form.priceMin, currency)
    if (!min) return ''
    const max = formatMoney(form.priceMax, currency)
    const base = max && form.priceMax !== form.priceMin ? `${min} – ${max}` : min
    return form.rangeNegotiable ? `${base} • Negotiable` : base
  }
  const amount = formatMoney(form.amount, currency)
  if (!amount) return ''
  const unit = form.rateUnit === 'custom' ? form.rateUnitCustom.trim() : RATE_UNITS.find((u) => u.value === form.rateUnit)?.short || ''
  const base = unit ? `${amount} ${unit}` : amount
  return form.priceMode === 'negotiable' ? `${base} • Negotiable` : base
}

export function hoursLine(form) {
  if (form.flexibleHours) return 'Flexible hours'
  const from = formatClock(form.availableFrom)
  const to = formatClock(form.availableTo)
  if (from && to) return `Daily, ${from} – ${to}`
  return from || to ? `Daily, ${from || to}` : ''
}

export function buildPreview(form, { role }) {
  const copy = roleCopy(role)
  const country = countryByName(form.countryName)
  return {
    role: copy.role,
    listingLabel: copy.listingLabel,
    priceNoun: copy.priceNoun,
    title: form.title.trim(),
    category: finalCategory(form),
    description: form.description.trim(),
    skills: parseSkills(form.skills),
    hatType: form.hatType,
    verified: isVerifiedName(form.verifiedName),
    available: Boolean(form.available),
    openLabel: copy.openSwitch,
    hours: hoursLine(form),
    location: [form.city.trim(), country.name].filter(Boolean).join(', '),
    delivery: DELIVERY_OPTIONS.find((o) => o.value === form.deliveryMode)?.label || '',
    price: priceLine(form),
  }
}

/* ── Errors from the network ─────────────────────────────────────────── */

/**
 * Turns a failed save/load into one understandable sentence. Server messages
 * are only shown for 4xx responses (they're written for people); 5xx bodies
 * can carry raw database text, so those get a generic line instead.
 */
export function describeSaveError(err, verb = 'publish') {
  const status = err?.status
  const kept = 'Your information is still here.'
  if (status === 401) {
    return { message: `Your session has expired. Sign in again, then try again. ${kept}`, sessionExpired: true }
  }
  if (!status) {
    return { message: `Couldn't reach ChombuTar. Check your connection and try again. ${kept}`, sessionExpired: false }
  }
  if (status >= 400 && status < 500 && err.message) {
    const detail = /[.!?]$/.test(err.message) ? err.message : `${err.message}.`
    return { message: `Couldn't ${verb} this Hat. ${detail} ${kept}`, sessionExpired: false }
  }
  return { message: `Couldn't ${verb} this Hat. ${kept} Try again.`, sessionExpired: false }
}

export function describeLoadError(err) {
  if (err?.status === 401) return { message: 'Your session has expired. Sign in again to edit this Hat.', sessionExpired: true }
  if (err?.status === 404) return { message: "This Hat doesn't exist any more.", sessionExpired: false }
  if (!err?.status) return { message: "Couldn't reach ChombuTar. Check your connection and try again.", sessionExpired: false }
  return { message: "Couldn't load this Hat. Try again.", sessionExpired: false }
}

export function describeUploadError(err) {
  if (err?.code === 'network' || err instanceof TypeError) return 'Upload interrupted. Check your connection, then retry.'
  return err?.message || 'Upload failed. Try again.'
}