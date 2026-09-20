import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeMoneyInput, hasNegativeSign, groupDigits, caretForDigitCount, formatMoney,
  emptyForm, hydrateForm, validateForm, buildPayload, buildPreview, summarizeErrors,
  roleCopy, deriveNewHatRole, describeSaveError, mediaSignature, formSignature,
  OTHER_CATEGORY, MAX_PRICE,
} from '../src/lib/hatForm.js'

const media = (ready = 1, uploading = 0, failed = 0) => ({ ready, uploading, failed })
function validForm(over = {}) {
  return {
    ...emptyForm(null), title: 'Wedding Photographer', category: 'Photography & Videography',
    amount: '25000', deliveryMode: 'Remote', ...over,
  }
}

test('money input: digits only, whole naira, no sign, sensible paste handling', () => {
  assert.equal(sanitizeMoneyInput('₦25,000'), '25000')
  assert.equal(sanitizeMoneyInput('₦25,000.50'), '25000')
  assert.equal(sanitizeMoneyInput('  1 200 '), '1200')
  assert.equal(sanitizeMoneyInput('abc'), '')
  assert.equal(sanitizeMoneyInput('007'), '7')
  assert.equal(sanitizeMoneyInput('0'), '0')
  assert.equal(sanitizeMoneyInput('-500'), '500')
  assert.equal(sanitizeMoneyInput('99999999999999'), '9999999999')
  assert.equal(sanitizeMoneyInput(null), '')
})

test('negative amounts are detected so the field can reject them', () => {
  for (const v of ['-500', '  -500', '₦-500', '-₦500', '(500)', '−500']) assert.equal(hasNegativeSign(v), true, v)
  for (const v of ['500', '₦25,000', '25-000x'.slice(0, 2)]) assert.equal(hasNegativeSign(v), false, v)
})

test('grouping and caret mapping keep the cursor next to the same digit', () => {
  assert.equal(groupDigits('1234567'), '1,234,567')
  assert.equal(groupDigits('999'), '999')
  assert.equal(groupDigits(''), '')
  assert.equal(caretForDigitCount('1,234', 0), 0)
  assert.equal(caretForDigitCount('1,234', 1), 1)
  assert.equal(caretForDigitCount('1,234', 2), 3)
  assert.equal(caretForDigitCount('1,234', 4), 5)
  assert.equal(caretForDigitCount('1,234', 99), 5)
})

test('display formatting is separate from the stored numeric value', () => {
  assert.equal(formatMoney('25000', 'NGN'), '₦25,000')
  assert.equal(formatMoney('', 'NGN'), '')
  const body = buildPayload(validForm({ amount: '25000' }), { mode: 'create', role: 'talent' })
  assert.equal(body.rate, 25000)
  assert.equal(typeof body.rate, 'number')
})

test('role decides Seeking/Hiring and the wording', () => {
  assert.equal(roleCopy('talent').listingLabel, 'Seeking')
  assert.equal(roleCopy('client').listingLabel, 'Hiring')
  assert.equal(roleCopy('talent').titleQuestion, 'What service are you available for?')
  assert.equal(roleCopy('client').titleQuestion, 'Who are you looking for?')
  assert.equal(roleCopy('talent').priceQuestion, 'What do you charge?')
  assert.equal(roleCopy('client').priceQuestion, 'What is your budget?')
  assert.equal(roleCopy('talent').whenQuestion, 'When are you available?')
  assert.equal(roleCopy('client').whenQuestion, 'When do you need them?')
  assert.equal(roleCopy('talent').fixedLabel, 'Your price')
  assert.equal(roleCopy('client').fixedLabel, 'Your budget')
  assert.equal(roleCopy('dual').listingLabel, 'Seeking', 'hat roles are never dual')
})

test('only dual accounts get to choose; talent/client accounts are fixed', () => {
  assert.deepEqual(deriveNewHatRole('talent', 'client'), { role: 'talent', canChoose: false })
  assert.deepEqual(deriveNewHatRole('client', 'talent'), { role: 'client', canChoose: false })
  assert.deepEqual(deriveNewHatRole('dual', 'client'), { role: 'client', canChoose: true })
  assert.deepEqual(deriveNewHatRole('dual'), { role: 'talent', canChoose: true })
})

test('a complete talent form validates', () => {
  assert.deepEqual(validateForm(validForm(), { role: 'talent', media: media(1) }), {})
})

test('required fields are all reported together, in page order', () => {
  const errors = validateForm(emptyForm(null), { role: 'talent', media: media(0) })
  assert.deepEqual(Object.keys(errors), ['title', 'category', 'media', 'amount', 'deliveryMode'])
  assert.equal(errors.title, 'Title is required.')
  assert.equal(errors.amount, 'Enter a valid price.')
  const rows = summarizeErrors(errors, 'talent')
  assert.deepEqual(rows.map((r) => r.label), ['Title', 'Category', 'Media', 'Price', 'How this will work'])
})

test('client wording, and media is optional for clients', () => {
  const errors = validateForm({ ...emptyForm(null), amount: '' }, { role: 'client', media: media(0) })
  assert.equal(errors.amount, 'Enter a valid budget.')
  assert.equal(errors.media, undefined)
  assert.equal(summarizeErrors(errors, 'client').find((r) => r.field === 'amount').label, 'Budget')
})

test('media gates: uploading and failed block, talent needs at least one', () => {
  assert.equal(validateForm(validForm(), { role: 'talent', media: media(1, 1, 0) }).media, 'Wait for uploads to finish.')
  assert.match(validateForm(validForm(), { role: 'talent', media: media(1, 0, 1) }).media, /failed/)
  assert.match(validateForm(validForm(), { role: 'talent', media: media(0) }).media, /Talent Hats need media/)
  assert.equal(validateForm(validForm(), { role: 'client', media: media(0, 1, 0) }).media, 'Wait for uploads to finish.')
})

test('price validation: zero, empty, oversized, and range ordering', () => {
  const ctx = { role: 'talent', media: media(1) }
  assert.match(validateForm(validForm({ amount: '0' }), ctx).amount, /more than zero/)
  assert.equal(validateForm(validForm({ amount: '' }), ctx).amount, 'Enter a valid price.')
  assert.match(validateForm(validForm({ amount: String(MAX_PRICE + 1) }), ctx).amount, /or less/)
  assert.equal(validateForm(validForm({ amount: String(MAX_PRICE) }), ctx).amount, undefined)

  const range = (min, max) => validateForm(validForm({ priceMode: 'range', priceMin: min, priceMax: max }), ctx)
  assert.deepEqual(range('1000', '5000'), {})
  assert.equal(range('5000', '1000').priceMax, 'Maximum must be at least the minimum.')
  assert.equal(range('', '1000').priceMin, 'Enter a valid minimum.')
  assert.equal(range('1000', '1000').priceMax, undefined)
})

test('negotiable still needs a starting price; custom unit needs a label', () => {
  const ctx = { role: 'talent', media: media(1) }
  assert.equal(validateForm(validForm({ priceMode: 'negotiable', amount: '' }), ctx).amount, 'Enter a valid price.')
  assert.equal(validateForm(validForm({ rateUnit: 'custom', rateUnitCustom: '' }), ctx).rateUnitCustom.startsWith('Enter a label'), true)
})

test('availability: flexible needs nothing, specific hours need both and must differ', () => {
  const ctx = { role: 'talent', media: media(1) }
  assert.deepEqual(validateForm(validForm({ flexibleHours: true }), ctx), {})
  const e = validateForm(validForm({ flexibleHours: false }), ctx)
  assert.equal(e.availableFrom, 'Select a start time.')
  assert.equal(e.availableTo, 'Select an end time.')
  assert.equal(validateForm(validForm({ flexibleHours: false, availableFrom: '09:00', availableTo: '09:00' }), ctx).availableTo, "Start and end time can't be the same.")
  assert.deepEqual(validateForm(validForm({ flexibleHours: false, availableFrom: '22:00', availableTo: '02:00' }), ctx), {}, 'overnight is fine')
})

test('location: required on-site, optional remote/either', () => {
  const ctx = { role: 'talent', media: media(1) }
  assert.equal(validateForm(validForm({ deliveryMode: 'Physical', city: '' }), ctx).city, 'Location is required for on-site work.')
  assert.deepEqual(validateForm(validForm({ deliveryMode: 'Physical', city: 'Abuja' }), ctx), {})
  assert.deepEqual(validateForm(validForm({ deliveryMode: 'Remote', city: '' }), ctx), {})
  assert.deepEqual(validateForm(validForm({ deliveryMode: 'Hybrid', city: '' }), ctx), {})
  assert.equal(validateForm(validForm({ deliveryMode: '' }), ctx).deliveryMode, 'Choose how this will work.')
})

test('custom category is validated only when "Other" is chosen', () => {
  const ctx = { role: 'talent', media: media(1) }
  assert.match(validateForm(validForm({ category: OTHER_CATEGORY, customCategory: '' }), ctx).categoryCustom, /category name/)
  assert.deepEqual(validateForm(validForm({ category: OTHER_CATEGORY, customCategory: 'Drone Pilots' }), ctx), {})
  assert.equal(buildPayload(validForm({ category: OTHER_CATEGORY, customCategory: ' Drone Pilots ' }), { mode: 'create', role: 'talent' }).category, 'Drone Pilots')
})

test('price payloads: fixed / negotiable / range map onto existing fields only', () => {
  const opts = { mode: 'create', role: 'talent' }
  const fixed = buildPayload(validForm(), opts)
  assert.equal(fixed.price_type, 'fixed'); assert.equal(fixed.price_negotiable, false); assert.equal(fixed.rate, 25000)
  assert.equal(fixed.price_min, undefined)

  const neg = buildPayload(validForm({ priceMode: 'negotiable' }), opts)
  assert.equal(neg.price_type, 'fixed'); assert.equal(neg.price_negotiable, true); assert.equal(neg.rate, 25000)

  const range = buildPayload(validForm({ priceMode: 'range', priceMin: '1000', priceMax: '5000', rangeNegotiable: true }), opts)
  assert.equal(range.price_type, 'range'); assert.equal(range.price_min, 1000); assert.equal(range.price_max, 5000)
  assert.equal(range.price_negotiable, true); assert.equal(range.rate, undefined)

  for (const b of [fixed, neg, range]) {
    for (const forbidden of ['priceType', 'pricing_type', 'negotiable', 'isNegotiable', 'price_mode']) assert.equal(forbidden in b, false, forbidden)
  }
})

test('create sends role; edit never does; media only when supplied', () => {
  const create = buildPayload(validForm(), { mode: 'create', role: 'client', media: [{ url: 'u', public_id: 'p', type: 'image' }] })
  assert.equal(create.role, 'client')
  assert.equal(create.media.length, 1)

  const edit = buildPayload(validForm(), { mode: 'edit', role: 'client' })
  assert.equal('role' in edit, false)
  assert.equal('media' in edit, false, 'unchanged media is left alone')
})

test('edit can clear the availability window and verified name; create omits empties', () => {
  const edit = buildPayload(validForm({ flexibleHours: true, verifiedName: '' }), { mode: 'edit', role: 'talent' })
  assert.equal(edit.available_from, null); assert.equal(edit.available_to, null); assert.equal(edit.verified_name, '')
  const create = buildPayload(validForm({ verifiedName: '' }), { mode: 'create', role: 'talent' })
  assert.equal('verified_name' in create, false)
  const timed = buildPayload(validForm({ flexibleHours: false, availableFrom: '09:00', availableTo: '17:30' }), { mode: 'create', role: 'talent' })
  assert.equal(timed.available_from, '09:00'); assert.equal(timed.available_to, '17:30')
})

test('hydrate -> build round-trips an existing hat without losing anything', () => {
  const hat = {
    hat_title: 'Henna artist', category: 'Beauty & Grooming', motto: 'Bridal specialist', skills: ['Henna', 'Bridal'],
    hat_type: 'One-Off', verified_name: 'Acme Ltd', price_type: 'fixed', rate: 15000, rate_unit: 'custom', rate_unit_custom: 'per hand',
    price_negotiable: true, availability: false, available_from: '09:00:00', available_to: '17:00:00',
    country: 'Ghana', lga: 'Accra', delivery_mode: 'Physical', role: 'talent',
  }
  const form = hydrateForm(hat)
  assert.equal(form.priceMode, 'negotiable')
  assert.equal(form.flexibleHours, false)
  assert.equal(form.available, false, 'an unavailable hat stays unavailable on edit')
  const body = buildPayload(form, { mode: 'edit', role: 'talent' })
  assert.equal(body.hat_title, 'Henna artist'); assert.equal(body.rate, 15000); assert.equal(body.rate_unit_custom, 'per hand')
  assert.equal(body.price_negotiable, true); assert.equal(body.availability, false)
  assert.equal(body.available_from, '09:00'); assert.equal(body.country, 'Ghana'); assert.equal(body.currency, 'GHS')
  assert.deepEqual(body.skills, ['Henna', 'Bridal']); assert.equal(body.motto, 'Bridal specialist')
})

test('legacy range hats hydrate as range; legacy blank window is flexible', () => {
  const form = hydrateForm({ price_type: 'range', price_min: 1000, price_max: 4000, price_negotiable: true, delivery_mode: null, availability: true })
  assert.equal(form.priceMode, 'range'); assert.equal(form.rangeNegotiable, true)
  assert.equal(form.flexibleHours, true); assert.equal(form.deliveryMode, '')
})

test('profile location seeds a new hat only when the country is supported', () => {
  assert.equal(emptyForm({ country: 'Ghana', lga: 'Accra' }).city, 'Accra')
  assert.equal(emptyForm({ country: 'Ghana' }).countryName, 'Ghana')
  assert.equal(emptyForm({ country: 'Atlantis', lga: 'X' }).city, '')
  assert.equal(emptyForm(null).countryName, 'Nigeria')
})

test('preview reflects the form: price, negotiable marker, hours, location', () => {
  const p = buildPreview(validForm({ priceMode: 'negotiable', city: 'Abuja', deliveryMode: 'Physical', flexibleHours: false, availableFrom: '09:00', availableTo: '17:00', description: 'Candid' }), { role: 'talent' })
  assert.equal(p.listingLabel, 'Seeking'); assert.equal(p.price, '₦25,000 /hr • Negotiable')
  assert.equal(p.hours, 'Daily, 9:00 AM – 5:00 PM'); assert.equal(p.location, 'Abuja, Nigeria'); assert.equal(p.delivery, 'On-site')
  assert.equal(buildPreview(validForm({ amount: '' }), { role: 'client' }).price, '')
  assert.equal(buildPreview(validForm(), { role: 'client' }).listingLabel, 'Hiring')
  assert.equal(buildPreview(validForm({ priceMode: 'range', priceMin: '1000', priceMax: '5000' }), { role: 'talent' }).price, '₦1,000 – ₦5,000')
})

test('save errors: understandable, and raw 5xx text never reaches the user', () => {
  assert.match(describeSaveError({ status: 401 }).message, /session has expired/)
  assert.equal(describeSaveError({ status: 401 }).sessionExpired, true)
  assert.match(describeSaveError(new TypeError('Failed to fetch')).message, /Couldn't reach ChombuTar/)
  assert.match(describeSaveError({ status: 400, message: 'Invalid hat type.' }).message, /Invalid hat type\. Your information is still here\./)
  const server = describeSaveError({ status: 500, message: 'duplicate key value violates unique constraint "x"' }, 'publish')
  assert.equal(server.message, "Couldn't publish this Hat. Your information is still here. Try again.")
  assert.doesNotMatch(server.message, /constraint/)
})

test('unsaved-change signature changes with edits and with media', () => {
  const f = emptyForm(null)
  const base = formSignature(f, 'talent', mediaSignature([], 0))
  assert.equal(formSignature({ ...f }, 'talent', mediaSignature([], 0)), base)
  assert.notEqual(formSignature({ ...f, title: 'x' }, 'talent', mediaSignature([], 0)), base)
  assert.notEqual(formSignature(f, 'talent', mediaSignature(['a'], 0)), base)
  assert.notEqual(formSignature(f, 'talent', mediaSignature([], 1)), base)
  assert.notEqual(mediaSignature(['a', 'b'], 0), mediaSignature(['b', 'a'], 0), 'reordering counts as a change')
})
