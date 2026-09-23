import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePricing, resolveHatRole, formatPrice, MAX_PRICE } from '../api/_lib/hatFields.js'

test('fixed pricing is always fixed', () => {
  const plain = normalizePricing({ price_type: 'fixed', rate: 25000, rate_unit: 'hr', price_negotiable: true })
  assert.equal(plain.ok, true)
  assert.equal(plain.fields.price_negotiable, false)
  assert.equal(plain.fields.rate, 25000)
  assert.equal(plain.fields.price_min, null)
  assert.equal(plain.fields.price_max, null)
})

test('range pricing stores min/max and automatically enables the offer flow', () => {
  const r = normalizePricing({ price_type: 'range', price_min: 1000, price_max: 5000 })
  assert.deepEqual(r.fields, {
    price_type: 'range', rate: null, rate_unit: null, rate_unit_custom: null,
    price_min: 1000, price_max: 5000, price_negotiable: true,
  })
  assert.equal(normalizePricing({ price_type: 'range', price_min: 5000, price_max: 1000 }).ok, false)
})

test('rejects zero, negative, fractional, missing and oversized amounts', () => {
  for (const rate of [0, -5, 25000.5, 'abc', null, undefined, MAX_PRICE + 1]) {
    assert.equal(normalizePricing({ price_type: 'fixed', rate, rate_unit: 'hr' }).ok, false, String(rate))
  }
  assert.equal(normalizePricing({ price_type: 'fixed', rate: MAX_PRICE, rate_unit: 'hr' }).ok, true)
  assert.equal(normalizePricing({ price_type: 'fixed', rate: 100 }).ok, false, 'unit required')
  assert.equal(normalizePricing({ price_type: 'fixed', rate: 100, rate_unit: 'custom' }).ok, false, 'custom label required')
})

test('formatPrice shows fixed and min-max range distinctly', () => {
  assert.equal(formatPrice({ price_type: 'fixed', rate: 25000, rate_unit: 'hr', price_negotiable: false }, 'NGN'), '₦25,000 /hr')
  assert.equal(formatPrice({ price_type: 'range', price_min: 1000, price_max: 5000, price_negotiable: true }, 'NGN'), '₦1,000 – ₦5,000')
})

test('hat role comes from the account, not the browser', () => {
  assert.deepEqual(resolveHatRole('talent', undefined), { ok: true, role: 'talent' })
  assert.deepEqual(resolveHatRole('talent', 'talent'), { ok: true, role: 'talent' })
  assert.deepEqual(resolveHatRole('client', 'client'), { ok: true, role: 'client' })

  const spoof = resolveHatRole('talent', 'client')
  assert.equal(spoof.ok, false)
  assert.equal(spoof.status, 403)
  assert.equal(resolveHatRole('client', 'talent').status, 403)
  assert.equal(resolveHatRole('client', 'dual').status, 403)
})

test('dual accounts choose a role, defaulting to talent', () => {
  assert.deepEqual(resolveHatRole('dual', undefined), { ok: true, role: 'talent' })
  assert.deepEqual(resolveHatRole('dual', ''), { ok: true, role: 'talent' })
  assert.deepEqual(resolveHatRole('dual', 'client'), { ok: true, role: 'client' })
  assert.equal(resolveHatRole('dual', 'admin').status, 400)
  assert.equal(resolveHatRole('dual', 'dual').status, 400)
})

test('unknown account roles cannot create hats', () => {
  assert.equal(resolveHatRole(undefined, 'talent').ok, false)
  assert.equal(resolveHatRole('creator', 'talent').status, 403)
})
