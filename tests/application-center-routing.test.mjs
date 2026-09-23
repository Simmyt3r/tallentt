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

test('My Deals owns incoming and outgoing applications and bookings', async () => {
  const source = await read('src/components/MyDealsModal.jsx')
  assert.match(source, /Talent Mode/)
  assert.match(source, /Client Mode/)
  assert.match(source, /\['incoming', 'Incoming'\]/)
  assert.match(source, /\['outgoing', 'Outgoing'\]/)
  assert.match(source, /respondToApplication\(item\.hat_id, item\.application_id, status\)/)
  assert.match(source, /respondToBooking\(item\.id, status\)/)
})

test('API exposes a unified deals projection from applications and escrows', async () => {
  const [server, route, client] = await Promise.all([
    read('api/_lib/myDeals.js'),
    read('api/escrows/index.js'),
    read('src/lib/api.js'),
  ])
  assert.match(server, /FROM applications a/)
  assert.match(server, /FROM escrows e/)
  assert.match(server, /pendingCount/)
  assert.match(route, /getMyDeals\(session\.sub\)/)
  assert.match(client, /getMyDeals: \(\) => request\('\/api\/escrows\?deals=1'\)/)
})

test('active booking management remains inside My Deals and Messages', async () => {
  const deals = await read('src/components/MyDealsModal.jsx')
  assert.match(deals, /payForBooking/)
  assert.match(deals, /fundEscrowWithWallet/)
  assert.match(deals, /\/messages\?escrow=/)
})
