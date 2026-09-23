import test from 'node:test'
import assert from 'node:assert/strict'
import { containsContactDetails, messageText, canShareContacts, requireAmount } from '../api/_lib/bookingRules.js'

test('blocks common contact formats and obfuscations before funding', () => {
  for (const value of [
    'Call 08012345678', '+234 (801) 234-5678', '080 1234 5678',
    'zero eight zero one two three four five six seven eight',
    '０８０１２３４５６７８', '٠٨٠١٢٣٤٥٦٧٨', '0801\u200b2345678',
    'email@example.com', 'email [at] example [dot] com', 'email (at) example (dot) com',
    'https://example.com', 'wa.me/12345', 't.me/myhandle', '@myhandle', 'My number is below',
  ]) {
    assert.equal(containsContactDetails(value), true, value)
    assert.throws(() => messageText(value, { status: 'not_funded' }), { status: 422 })
  }
})

test('allows ordinary work discussion and prices', () => {
  for (const value of ['Can we agree on NGN 25000?', 'Deliver 3 videos by Friday.', 'I can meet at the studio.', 'The budget is 10,000.']) {
    assert.equal(containsContactDetails(value), false, value)
  }
})

test('acceptance unlocks contacts before payment while closed deals remain locked', () => {
  for (const status of ['not_funded', 'cancelled', 'secured', 'released']) {
    for (const unlocked of [false, true]) {
      const escrow = { status, contacts_unlocked: unlocked }
      const allowed = unlocked && !['cancelled', 'refunded'].includes(status)
      assert.equal(canShareContacts(escrow), allowed)
      if (allowed) assert.equal(messageText('a@example.com', escrow), 'a@example.com')
      else assert.throws(() => messageText('a@example.com', escrow), { status: 422 })
    }
  }
})

test('rejects malformed prices and empty or oversized messages', () => {
  for (const value of [0, -1, 0.1, '100', NaN, Infinity, true, 2147483648]) assert.throws(() => requireAmount(value), { status: 400 })
  for (const value of ['', '  ', 'a'.repeat(2001), {}, null]) assert.throws(() => messageText(value, {}), { status: 400 })
})
