import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ALL_WEEKDAYS,
  emptyForm,
  formatAvailableDays,
  hoursLine,
  hydrateForm,
  validateForm,
  buildPayload,
} from '../src/lib/hatForm.js'
import { AVAILABLE_DAYS, normalizeAvailableDays } from '../api/_lib/hatFields.js'

const media = { ready: 1, uploading: 0, failed: 0 }

function validForm(over = {}) {
  return {
    ...emptyForm(null),
    hatName: 'Weekday editor',
    title: 'Video editor',
    category: 'Photography & Videography',
    amount: '25000',
    deliveryMode: 'Remote',
    ...over,
  }
}

test('new Hats default to every day and day labels collapse cleanly', () => {
  assert.deepEqual(emptyForm(null).availableDays, ALL_WEEKDAYS)
  assert.equal(formatAvailableDays(ALL_WEEKDAYS), 'Mon–Sun')
  assert.equal(formatAvailableDays(['mon', 'tue', 'wed', 'thu', 'fri']), 'Mon–Fri')
  assert.equal(formatAvailableDays(['sat', 'sun']), 'Sat–Sun')
  assert.equal(formatAvailableDays(['mon', 'wed', 'fri']), 'Mon, Wed, Fri')
})

test('availability line combines selected days with flexible or fixed hours', () => {
  assert.equal(hoursLine(validForm({ availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], flexibleHours: true })), 'Mon–Fri · Flexible hours')
  assert.equal(
    hoursLine(validForm({ availableDays: ALL_WEEKDAYS, flexibleHours: false, availableFrom: '09:00', availableTo: '17:00' })),
    'Mon–Sun · 9:00 AM – 5:00 PM',
  )
})

test('form requires at least one day and sends canonical days to the API', () => {
  const noDays = validForm({ availableDays: [] })
  assert.equal(validateForm(noDays, { role: 'talent', media }).availableDays, 'Choose at least one available day.')

  const form = validForm({ availableDays: ['fri', 'mon', 'wed', 'mon'] })
  const payload = buildPayload(form, { mode: 'create', role: 'talent' })
  assert.deepEqual(payload.available_days, ['mon', 'wed', 'fri'])
})

test('legacy Hats hydrate as Mon-Sun while stored schedules hydrate exactly', () => {
  const legacy = hydrateForm({ availability: true })
  assert.deepEqual(legacy.availableDays, ALL_WEEKDAYS)

  const stored = hydrateForm({ availability: true, available_days: ['mon', 'tue', 'wed', 'thu', 'fri'] })
  assert.deepEqual(stored.availableDays, ['mon', 'tue', 'wed', 'thu', 'fri'])
})

test('server validates and orders weekday arrays', () => {
  assert.deepEqual(AVAILABLE_DAYS, ALL_WEEKDAYS)
  assert.deepEqual(normalizeAvailableDays(['fri', 'mon', 'wed', 'mon']), {
    ok: true,
    days: ['mon', 'wed', 'fri'],
  })
  assert.deepEqual(normalizeAvailableDays(undefined, undefined), { ok: true, days: ALL_WEEKDAYS })
  assert.equal(normalizeAvailableDays([]).ok, false)
  assert.equal(normalizeAvailableDays(['mon', 'funday']).ok, false)
})

test('schema and standalone migration carry available_days safely', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../db/hat-availability-days.sql', import.meta.url), 'utf8'),
  ])
  for (const source of [schema, migration]) {
    assert.match(source, /available_days TEXT\[\]/)
    assert.match(source, /mon.*tue.*wed.*thu.*fri.*sat.*sun/s)
    assert.match(source, /hats_available_days_check/)
  }
})
