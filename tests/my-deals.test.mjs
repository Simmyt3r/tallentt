import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('My Deals replaces split application/booking navigation', () => {
  const nav = read('src/lib/nav.js')
  const app = read('src/App.jsx')
  assert.match(nav, /to: '\/deals'.*label: 'My Deals'/)
  assert.doesNotMatch(nav, /label: 'Applications'/)
  assert.doesNotMatch(nav, /label: 'Bookings'/)
  assert.match(app, /path="\/deals"/)
  assert.match(app, /my-applications".*deals\?role=talent&tab=outgoing/)
  assert.match(app, /my-bookings".*deals\?role=client&tab=outgoing/)
})

test('mobile nav places My Deals between Showroom and Live and shows pending badge', () => {
  const source = read('src/components/BottomNav.jsx')
  const showroom = source.indexOf('label="Showroom"')
  const deals = source.indexOf('label="My Deals"')
  const live = source.indexOf('label="Live"')
  assert.ok(showroom > -1 && deals > showroom && live > deals)
  assert.match(source, /badge=\{pendingDeals\}/)
})

test('modal implements requested role modes, direction tabs and skeleton cards without extra sorting controls', () => {
  const source = read('src/components/MyDealsModal.jsx')
  for (const phrase of [
    'All your active deals in one place',
    'Talent Mode',
    'Client Mode',
    'Incoming',
    'Outgoing',
    'Active Deals',
    'No incoming bookings yet — your Showroom is live',
    'h-[260px]',
  ]) assert.ok(source.includes(phrase), phrase)
  for (const removed of ['Search by username LGA', 'Freelance', 'Contract']) {
    assert.ok(!source.includes(removed), removed)
  }
})

test('acceptance is required and every booking payment settles through the wallet ledger', () => {
  const checkout = read('api/_lib/bookingCheckout.js')
  const payments = read('api/_lib/escrowPayments.js')
  const rules = read('api/_lib/bookingRules.js')
  const dealsUi = read('src/components/MyDealsModal.jsx')
  assert.match(checkout, /must accept this booking request before payment/)
  assert.match(checkout, /type: 'escrow_fund'/)
  assert.match(payments, /applyVerifiedLegacyBookingCharge/)
  assert.match(dealsUi, /Pay from wallet/)
  assert.doesNotMatch(dealsUi, /Pay with card/)
  assert.match(rules, /contacts_unlocked === true/)
  assert.match(rules, /!\['cancelled', 'refunded'\]\.includes/)
})

test('server emits myDeals invalidations and promotes accepted applications into active escrows', () => {
  const deals = read('api/_lib/myDeals.js')
  assert.match(deals, /emitLiveEvent\(userId, 'myDeals'/)
  assert.match(deals, /application_id, request_kind, currency, pay_unit, agreed_at/)
  assert.match(deals, /type: 'booking_accepted'/)
  assert.match(deals, /type: `application_\$\{status\}`/)
  assert.match(deals, /Agree the Range price before accepting this application/)
  assert.match(deals, /negotiation_escrow_id/)
})
