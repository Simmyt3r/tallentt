import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('My Hats no longer owns application review UI', async () => {
  const source = await read('src/components/MyHats.jsx')
  assert.doesNotMatch(source, /ApplicantsPanel/)
  assert.doesNotMatch(source, /getHatApplicants/)
  assert.doesNotMatch(source, />\s*Applicants\s*</)
  assert.doesNotMatch(source, /respondToApplication/)
})

test('My Applications contains Sent and Received views', async () => {
  const source = await read('src/pages/MyApplications.jsx')
  assert.match(source, /setTab\('sent'\)/)
  assert.match(source, /setTab\('received'\)/)
  assert.match(source, /getMyApplications\(\)/)
  assert.match(source, /getReceivedApplications\(\)/)
  assert.match(source, /respondToApplication\(a\.hat_id, a\.application_id, status\)/)
  assert.match(source, />\s*Accept\s*</)
  assert.match(source, />\s*Reject\s*</)
})

test('API exposes aggregate received applications for owned Client Hats', async () => {
  const [server, client] = await Promise.all([
    read('api/hats/index.js'),
    read('src/lib/api.js'),
  ])
  assert.match(server, /received_applications/)
  assert.match(server, /WHERE h\.user_id = \$1 AND h\.role = 'client'/)
  assert.match(server, /applicant_username/)
  assert.match(client, /getReceivedApplications: \(\) => request\('\/api\/hats\?received_applications=1'\)/)
})

test('booking management remains on My Bookings', async () => {
  const bookings = await read('src/pages/MyBookings.jsx')
  assert.match(bookings, /getMyBookings\(\)/)
  assert.match(bookings, /Manage booking/)
})
