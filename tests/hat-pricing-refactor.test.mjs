import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PRICE_MODES,
  emptyForm,
  hydrateForm,
  validateForm,
  buildPayload,
  priceLine,
} from '../src/lib/hatForm.js'
import { normalizePricing, formatPrice as formatServerPrice } from '../api/_lib/hatFields.js'

const media = { ready: 1, uploading: 0, failed: 0 }

function validForm(over = {}) {
  return {
    ...emptyForm(null),
    hatName: 'Weekend edit',
    title: 'Video editor',
    category: 'Photography & Videography',
    amount: '25000',
    deliveryMode: 'Remote',
    ...over,
  }
}

test('Hat setup exposes only Fixed and Range pricing choices', async () => {
  assert.deepEqual(PRICE_MODES.map((mode) => mode.value), ['fixed', 'range'])
  assert.deepEqual(PRICE_MODES.map((mode) => mode.label), ['Fixed', 'Range'])

  const source = await readFile(new URL('../src/components/hatform/PricingSection.jsx', import.meta.url), 'utf8')
  assert.match(source, /hat-price-min/)
  assert.match(source, /hat-price-max/)
  assert.match(source, /From/)
  assert.match(source, /To/)
  assert.doesNotMatch(source, /label: 'Negotiable'|value: 'negotiable'/)
})

test('Range requires and stores a real minimum and maximum', () => {
  const form = validForm({ priceMode: 'range', priceMin: '25000', priceMax: '50000' })
  assert.deepEqual(validateForm(form, { role: 'talent', media }), {})

  const payload = buildPayload(form, { mode: 'create', role: 'talent' })
  assert.equal(payload.price_type, 'range')
  assert.equal(payload.price_min, 25000)
  assert.equal(payload.price_max, 50000)
  assert.equal(payload.price_negotiable, true)
  assert.equal('rate' in payload, false)
  assert.equal(priceLine(form), '₦25,000 – ₦50,000')
})

test('Range rejects an inverted interval', () => {
  const form = validForm({ priceMode: 'range', priceMin: '50000', priceMax: '25000' })
  assert.equal(
    validateForm(form, { role: 'talent', media }).priceMax,
    'Maximum must be at least the minimum.',
  )
})

test('Fixed stays fixed and does not enter the offer flow', () => {
  const payload = buildPayload(validForm({ priceMode: 'fixed' }), { mode: 'create', role: 'talent' })
  assert.equal(payload.price_type, 'fixed')
  assert.equal(payload.price_negotiable, false)
  assert.equal(payload.rate, 25000)
})

test('existing single-starting-price Range Hats hydrate safely as equal bounds', () => {
  const flexible = hydrateForm({
    price_type: 'fixed',
    rate: 15000,
    rate_unit: 'day',
    price_negotiable: true,
    availability: true,
  })
  assert.equal(flexible.priceMode, 'range')
  assert.equal(flexible.priceMin, '15000')
  assert.equal(flexible.priceMax, '15000')

  const legacy = hydrateForm({
    price_type: 'range',
    price_min: 10000,
    price_max: 40000,
    price_negotiable: true,
    availability: true,
  })
  assert.equal(legacy.priceMode, 'range')
  assert.equal(legacy.priceMin, '10000')
  assert.equal(legacy.priceMax, '40000')
})

test('server enforces fixed versus range semantics', () => {
  const fixed = normalizePricing({
    price_type: 'fixed',
    rate: 25000,
    rate_unit: 'hr',
    price_negotiable: true,
  })
  assert.equal(fixed.ok, true)
  assert.equal(fixed.fields.price_type, 'fixed')
  assert.equal(fixed.fields.price_negotiable, false)
  assert.equal(formatServerPrice(fixed.fields, 'NGN'), '₦25,000 /hr')

  const range = normalizePricing({
    price_type: 'range',
    price_min: 10000,
    price_max: 40000,
  })
  assert.equal(range.ok, true)
  assert.equal(range.fields.price_type, 'range')
  assert.equal(range.fields.price_min, 10000)
  assert.equal(range.fields.price_max, 40000)
  assert.equal(range.fields.price_negotiable, true)
  assert.equal(formatServerPrice(range.fields, 'NGN'), '₦10,000 – ₦40,000')
})
