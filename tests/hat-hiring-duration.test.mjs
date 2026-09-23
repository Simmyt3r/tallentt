import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  HIRING_DURATIONS,
  emptyForm,
  hydrateForm,
  validateForm,
  buildPayload,
  buildPreview,
} from '../src/lib/hatForm.js'
import {
  HIRING_DURATIONS as SERVER_DURATIONS,
  normalizeHiringDuration,
} from '../api/_lib/hatFields.js'

const media = { ready: 0, uploading: 0, failed: 0 }

function clientForm(over = {}) {
  return {
    ...emptyForm(null),
    hatName: 'Backend developer contract',
    title: 'Backend developer',
    category: 'Tech & Digital Services',
    amount: '150000',
    deliveryMode: 'Remote',
    hiringDuration: '6 months',
    ...over,
  }
}

test('Client Hat exposes controlled hiring durations', () => {
  assert.deepEqual(HIRING_DURATIONS, [
    '1 month',
    '3 months',
    '6 months',
    '1 year',
    '1 year (renewable)',
    'Permanent job',
  ])
  assert.deepEqual(SERVER_DURATIONS, HIRING_DURATIONS)
})

test('Client Hat requires a hiring duration but Talent Hat does not', () => {
  const missing = validateForm(clientForm({ hiringDuration: '' }), { role: 'client', media })
  assert.equal(missing.hiringDuration, 'Choose how long this hiring is expected to last.')

  const valid = validateForm(clientForm(), { role: 'client', media })
  assert.equal(valid.hiringDuration, undefined)

  const talent = validateForm(clientForm({ hiringDuration: '' }), { role: 'talent', media: { ready: 1, uploading: 0, failed: 0 } })
  assert.equal(talent.hiringDuration, undefined)
})

test('payload stores duration only for Client Hats', () => {
  const client = buildPayload(clientForm({ hiringDuration: '1 year (renewable)' }), { mode: 'create', role: 'client' })
  assert.equal(client.hiring_duration, '1 year (renewable)')

  const talent = buildPayload(clientForm({ hiringDuration: '6 months' }), { mode: 'create', role: 'talent' })
  assert.equal(talent.hiring_duration, null)
})

test('edit hydration and preview retain Client hiring duration', () => {
  const form = hydrateForm({ role: 'client', hiring_duration: 'Permanent job', availability: true })
  assert.equal(form.hiringDuration, 'Permanent job')

  const preview = buildPreview(clientForm({ hiringDuration: 'Permanent job' }), { role: 'client' })
  assert.equal(preview.hiringDuration, 'Permanent job')
})

test('server validation rejects unsupported durations and ignores duration on Talent Hats', () => {
  assert.deepEqual(normalizeHiringDuration('6 months', 'client'), { ok: true, value: '6 months' })
  assert.equal(normalizeHiringDuration('18 months', 'client').ok, false)
  assert.deepEqual(normalizeHiringDuration('6 months', 'talent'), { ok: true, value: null })
})

test('availability status switch is separate from the schedule component', async () => {
  const [status, schedule, form] = await Promise.all([
    readFile(new URL('../src/components/hatform/AvailabilityStatusSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/hatform/AvailabilitySection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/HatForm.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(status, /<Switch/)
  assert.doesNotMatch(schedule, /<Switch/)
  assert.match(schedule, /title="Schedule"/)
  assert.match(form, /<AvailabilityStatusSection/)
  assert.match(form, /<AvailabilitySection/)
})

test('schema and migration include hiring_duration', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../db/hat-hiring-duration.sql', import.meta.url), 'utf8'),
  ])
  assert.match(schema, /hiring_duration TEXT/)
  assert.match(schema, /hats_hiring_duration_check/)
  assert.match(migration, /hiring_duration TEXT/)
  assert.match(migration, /Permanent job/)
})
