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
  assert.doesNotMatch(source, /Minimum to maximum/)
  assert.doesNotMatch(source, /rangeNegotiable/)
  assert.doesNotMatch(source, /hat-price-min|hat-price-max/)
  assert.doesNotMatch(source, /label: 'Negotiable'|value: 'negotiable'/)
})

test('Range is the old flexible starting-price behavior', () => {
  const form = validForm({ priceMode: 'range' })
  assert.deepEqual(validateForm(form, { role: 'talent', media }), {})

  const payload = buildPayload(form, { mode: 'create', role: 'talent' })
  assert.equal(payload.price_type, 'fixed')
  assert.equal(payload.rate, 25000)
  assert.equal(payload.rate_unit, 'hr')
  assert.equal(payload.price_negotiable, true)
  assert.equal('price_min' in payload, false)
  assert.equal('price_max' in payload, false)
  assert.equal(priceLine(form), '₦25,000 /hr • Range')
})

test('Fixed stays fixed and does not enter the offer flow', () => {
  const payload = buildPayload(validForm({ priceMode: 'fixed' }), { mode: 'create', role: 'talent' })
  assert.equal(payload.price_type, 'fixed')
  assert.equal(payload.price_negotiable, false)
  assert.equal(payload.rate, 25000)
})

test('existing flexible and legacy min-max Hats hydrate into the new Range choice', () => {
  const flexible = hydrateForm({
    price_type: 'fixed',
    rate: 15000,
    rate_unit: 'day',
    price_negotiable: true,
    availability: true,
  })
  assert.equal(flexible.priceMode, 'range')
  assert.equal(flexible.amount, '15000')
  assert.equal(flexible.rateUnit, 'day')

  const legacy = hydrateForm({
    price_type: 'range',
    price_min: 10000,
    price_max: 40000,
    price_negotiable: true,
    availability: true,
  })
  assert.equal(legacy.priceMode, 'range')
  assert.equal(legacy.amount, '10000')
})

test('server keeps legacy min-max compatibility while new Range uses the negotiable flag', () => {
  const modern = normalizePricing({
    price_type: 'fixed',
    rate: 25000,
    rate_unit: 'hr',
    price_negotiable: true,
  })
  assert.equal(modern.ok, true)
  assert.equal(modern.fields.price_type, 'fixed')
  assert.equal(modern.fields.price_negotiable, true)
  assert.equal(formatServerPrice(modern.fields, 'NGN'), '₦25,000 /hr (Range)')

  const legacy = normalizePricing({
    price_type: 'range',
    price_min: 10000,
    price_max: 40000,
    price_negotiable: true,
  })
  assert.equal(legacy.ok, true)
  assert.equal(legacy.fields.price_type, 'range')
  assert.equal(legacy.fields.price_min, 10000)
  assert.equal(legacy.fields.price_max, 40000)
})
