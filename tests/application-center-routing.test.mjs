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
  const source = await read('src/pages/MyDeals.jsx')
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
  assert.match(server, /getMyDealsPage/)
  assert.match(server, /getMyDealsCount/)
  assert.match(route, /getMyDealsPage\(session\.sub/)
  assert.match(client, /getMyDealsPage:/)
  assert.match(client, /getMyDealsCount:/)
})

test('active booking management lives on the deal detail page while index stays compact', async () => {
  const index = await read('src/pages/MyDeals.jsx')
  const detail = await read('src/pages/DealDetails.jsx')
  const funding = await read('src/components/EscrowFundingCard.jsx')
  assert.match(index, /\/messages\?escrow=/)
  assert.match(index, /\/deals\/\$\{item\.id\}/)
  assert.doesNotMatch(index, /EscrowFundingCard/)
  assert.doesNotMatch(index, /DealQrCheckpoint/)
  assert.doesNotMatch(index, /BookingProgress/)
  assert.match(detail, /fundEscrowWithWallet/)
  assert.match(detail, /\/negotiations\?escrow=/)
  assert.match(detail, /\/messages\?escrow=/)
  assert.match(detail, /Deals Chat/)
  assert.match(detail, /EscrowFundingCard/)
  assert.match(detail, /DealQrCheckpoint/)
  assert.match(detail, /BookingProgress/)
  assert.match(funding, /Fund escrow/)
  assert.match(funding, /Top up/)
  assert.doesNotMatch(detail, /payForBooking/)
  assert.doesNotMatch(detail, /Pay with card/)
})
