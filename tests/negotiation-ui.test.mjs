import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Range Hats start with a proposal instead of a fee detour', () => {
  const bento = read('src/components/BentoCardDetailModal.jsx')
  const showroom = read('src/components/ShowroomDetailModal.jsx')
  const shared = read('src/components/bentoCardShared.jsx')

  assert.doesNotMatch(bento, /NegotiationFeeNotice/)
  assert.doesNotMatch(showroom, /NegotiationFeeNotice/)
  assert.match(bento, /setNegotiationStep\('proposal'\)/)
  assert.match(showroom, /setNegotiationStep\('proposal'\)/)
  assert.match(shared, /Make your proposal/)
  assert.match(shared, /The final deal price is set only when one proposal is accepted/)
})

test('negotiation center, My Deals, and Deals Chat have strict responsibilities', () => {
  const messages = read('src/pages/Messages.jsx')
  const center = read('src/pages/Negotiations.jsx')
  const panel = read('src/components/NegotiationPanel.jsx')
  const parties = read('src/components/NegotiationParties.jsx')
  const deals = read('src/components/MyDealsModal.jsx')
  const threads = read('api/_lib/bookingThreads.js')

  for (const phrase of [
    'Price negotiation',
    'Proposal received',
    'Accept proposal',
    'Reject',
    'Counter',
    'Negotiation history',
    'Final agreed price',
    'Send counter proposal',
  ]) {
    assert.ok(panel.includes(phrase), phrase)
  }

  for (const tab of ['Action needed', 'Ongoing', 'Completed']) assert.ok(center.includes(tab))
  assert.match(center, /Price negotiation only/)
  assert.match(center, /Completed is negotiation history only/)
  assert.match(center, /This record is read-only/)
  assert.doesNotMatch(center, /fundEscrowWithWallet/)
  assert.doesNotMatch(center, /DealQrCheckpoint/)
  assert.doesNotMatch(center, /BookingProgress/)

  assert.match(threads, /EXISTS \([\s\S]*negotiation_offer\.kind = 'offer'/)

  assert.match(center, /NegotiationParties/)
  assert.match(parties, /Switch negotiation sides/)
  assert.match(parties, /Client/)
  assert.match(parties, /Talent/)
  assert.match(parties, /ArrowLeftRight/)
  assert.match(center, /filter\(\(message\) => message\.kind === 'offer'\)/)

  assert.match(messages, /message\.kind !== 'offer'/)
  assert.match(messages, /Type a message…/)
  assert.match(messages, /Messaging only/)
  assert.doesNotMatch(messages, /fundEscrowWithWallet/)
  assert.doesNotMatch(messages, /DealQrCheckpoint/)
  assert.doesNotMatch(messages, /EscrowFundingCard/)
  assert.doesNotMatch(messages, /BookingProgress\s*\(/)

  assert.match(deals, /EscrowFundingCard/)
  assert.match(deals, /DealQrCheckpoint/)
  assert.match(deals, /BookingProgress/)
})

test('thread API exposes the range and keeps the accepted proposal as the deal price', () => {
  const threads = read('api/_lib/bookingThreads.js')
  assert.match(threads, /price_min: escrow\.price_min, price_max: escrow\.price_max/)
  assert.match(threads, /offer_status = 'pending'/)
  assert.match(threads, /offer_status = 'superseded'/)
  assert.match(threads, /agreed_at = NOW\(\)/)
  assert.match(threads, /amount = \$1/)
})

test('My Deals exposes current proposal, agreement state, and both negotiation parties for Range deals', () => {
  const api = read('api/_lib/myDeals.js')
  const modal = read('src/components/MyDealsModal.jsx')

  assert.match(api, /pending_offer_amount/)
  assert.match(api, /pending_offer_sender_id/)
  assert.match(modal, /NegotiationParties/)
  assert.match(modal, /Listed range/)
  assert.match(modal, /Your proposal/)
  assert.match(modal, /Current proposal/)
  assert.match(modal, /Agreed:/)
})

test('live deal reads bypass browser cache so proposals refresh immediately', () => {
  const api = read('src/lib/api.js')
  assert.match(api, /getConversations:[\s\S]*cache: 'no-store'/)
  assert.match(api, /getMessages:[\s\S]*cache: 'no-store'/)
})
