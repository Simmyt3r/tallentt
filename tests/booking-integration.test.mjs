import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

let database, pool, threads, checkout, payments, myDeals, handler, signSession
let clientId, talentId, outsiderId, hatId, escrowId
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')

before(async () => {
  database = await testDatabase()
  pool = database.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'test-only-session-secret'
  await pool.query(schema)
  threads = await import('../api/_lib/bookingThreads.js')
  checkout = await import('../api/_lib/bookingCheckout.js')
  payments = await import('../api/_lib/escrowPayments.js')
  myDeals = await import('../api/_lib/myDeals.js')
  handler = (await import('../api/escrows/index.js')).default
  signSession = (await import('../api/_lib/auth.js')).signSession
})
after(async () => { await database?.close(); delete global.__tworldPool })

beforeEach(async () => {
  await pool.query('TRUNCATE users, hats, escrows, booking_messages, wallets, wallet_transactions, notifications CASCADE')
  clientId = randomUUID(); talentId = randomUUID(); outsiderId = randomUUID(); hatId = randomUUID(); escrowId = randomUUID()
  for (const [id, name] of [[clientId, 'client'], [talentId, 'talent'], [outsiderId, 'other']]) {
    await pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash)
      VALUES ($1, $2, $2, $3, '08012345678', 'test')`, [id, name, `${name}@example.test`])
  }
  await pool.query(`INSERT INTO hats (id, user_id, username, hat_title, hat_name, category, rate, price_negotiable)
    VALUES ($1, $2, 'talent', 'Video editing', 'Video editing', 'Film', 10000, true)`, [hatId, talentId])
  await pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount)
    VALUES ($1, $2, $3, $4, 10000)`, [escrowId, hatId, clientId, talentId])
  await pool.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 100000)`, [clientId])
})

const send = (sender, body = 'Can you deliver by Friday?', extra = {}) => threads.threadAction(sender, {
  action: 'send_message', escrow_id: escrowId, body, client_token: randomUUID(), ...extra,
})
const offer = (sender, amount = 8000, expected = null, extra = {}) => send(sender, '', {
  action: 'make_offer', amount, expected_offer_id: expected, ...extra,
})
const respond = (sender, id, status) => threads.threadAction(sender, { action: 'respond_offer', escrow_id: escrowId, offer_id: id, status })
const state = async () => (await pool.query('SELECT * FROM escrows WHERE id = $1', [escrowId])).rows[0]
const txn = (reference, amount = 1000000) => ({ reference, amount, status: 'success', currency: 'NGN', metadata: { escrow_id: escrowId } })
const accept = () => pool.query('UPDATE escrows SET contacts_unlocked = true WHERE id = $1', [escrowId])

test('migration works fresh and on upgrade, and does not lock new bookings on rerun', async () => {
  await pool.query(schema)
  assert.equal((await state()).checkout_locked_at, null)
  await pool.query('ALTER TABLE escrows DROP COLUMN checkout_locked_at')
  await pool.query(schema)
  assert.ok((await state()).checkout_locked_at)
  await pool.query(schema)
  assert.ok((await state()).checkout_locked_at)
})

test('both participants can list and read; outsiders cannot read or mutate', async () => {
  for (const user of [clientId, talentId]) {
    assert.equal((await threads.getConversations(user)).conversations.length, 1)
    const data = await threads.getThread(user, escrowId)
    assert.equal(data.thread.peer.email, null)
    assert.equal(data.thread.peer.phone, null)
    assert.equal(data.thread.payment_reference, undefined)
  }
  assert.equal((await threads.getConversations(outsiderId)).conversations.length, 0)
  await assert.rejects(threads.getThread(outsiderId, escrowId), { status: 404 })
  await assert.rejects(send(outsiderId), { status: 404 })
  await assert.rejects(offer(outsiderId), { status: 404 })
})

test('contact rejection persists nothing and message retries deliver once', async () => {
  await assert.rejects(send(clientId, 'a@example.com'), { status: 422 })
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM booking_messages')).rows[0].n, 0)
  const client_token = randomUUID()
  const first = await send(clientId, 'Hello', { client_token })
  const retry = await send(clientId, 'Hello', { client_token })
  assert.equal(first.id, retry.id)
  assert.equal(retry.alreadyProcessed, true)
  assert.equal((await threads.getConversations(talentId)).conversations[0].unread_count, 1)
  await threads.threadAction(talentId, { action: 'read_messages', escrow_id: escrowId, through_id: first.id })
  assert.equal((await threads.getConversations(talentId)).conversations[0].unread_count, 0)
})

test('counteroffers supersede, only recipients accept, and stale responses fail', async () => {
  await accept()
  const first = await offer(clientId)
  await assert.rejects(respond(clientId, first.id, 'accepted'), { status: 403 })
  await assert.rejects(respond(talentId, first.id, 'withdrawn'), { status: 403 })
  await assert.rejects(checkout.prepareCheckout(clientId, escrowId, 10000), { status: 409 })
  await assert.rejects(checkout.payBookingWithWallet(clientId, escrowId, 10000), { status: 409 })
  await assert.rejects(offer(talentId, 9000), { status: 409 })
  const counter = await offer(talentId, 9000, first.id)
  await assert.rejects(respond(talentId, first.id, 'accepted'), { status: 409 })
  await respond(clientId, counter.id, 'accepted')
  assert.equal((await state()).amount, 9000)
  assert.equal((await respond(clientId, counter.id, 'accepted')).alreadyProcessed, true)
  assert.equal((await threads.getConversations(talentId)).conversations[0].unread_count, 1)
})

test('Range booking must agree a proposal before the talent can accept it', async () => {
  await pool.query(
    `UPDATE hats SET price_type = 'range', rate = NULL, rate_unit = 'month',
       price_min = 8000, price_max = 12000, price_negotiable = true, currency = 'NGN'
     WHERE id = $1`,
    [hatId],
  )
  await pool.query(
    `UPDATE escrows SET amount = 8000, contacts_unlocked = false, agreed_at = NULL,
       currency = 'NGN', pay_unit = 'month' WHERE id = $1`,
    [escrowId],
  )

  await assert.rejects(
    myDeals.respondBookingRequest(talentId, escrowId, 'accepted'),
    { status: 409 },
  )

  const proposed = await offer(clientId, 11000)
  const pending = (await threads.getThread(talentId, escrowId)).thread.pending_offer
  assert.equal(pending.id, proposed.id)
  assert.equal(pending.amount, 11000)
  assert.equal(pending.currency, 'NGN')
  assert.equal(pending.pay_unit, 'month')

  await respond(talentId, proposed.id, 'accepted')
  const agreed = await state()
  assert.equal(agreed.amount, 11000)
  assert.equal(agreed.pay_unit, 'month')
  assert.ok(agreed.agreed_at)

  await myDeals.respondBookingRequest(talentId, escrowId, 'accepted')
  assert.equal((await state()).contacts_unlocked, true)
})

test('Range Client Hat application negotiates on a provisional deal before acceptance', async () => {
  const clientHatId = randomUUID()
  await pool.query(
    `INSERT INTO hats
       (id, user_id, username, hat_title, hat_name, category, role, hiring_duration,
        price_type, price_min, price_max, rate_unit, price_negotiable, currency)
     VALUES ($1,$2,'client','Backend engineer','Backend role','Tech','client','6 months',
             'range',40000,60000,'month',true,'NGN')`,
    [clientHatId, clientId],
  )

  const created = await myDeals.createApplicationRequest(
    talentId,
    clientHatId,
    'Available to start next week.',
    { proposedAmount: 55000, proposalMessage: 'My proposal for the monthly engagement.' },
  )
  assert.equal(created.application.status, 'pending')
  assert.equal(created.escrow.request_kind, 'application')
  assert.equal(created.escrow.contacts_unlocked, false)
  assert.equal(created.escrow.agreed_at, null)

  await assert.rejects(
    myDeals.respondApplicationDeal(clientId, clientHatId, created.application.id, 'accepted'),
    { status: 409 },
  )

  const negotiation = await threads.getThread(clientId, created.escrow.id)
  assert.equal(negotiation.thread.pending_offer.amount, 55000)
  assert.equal(negotiation.thread.pending_offer.currency, 'NGN')
  assert.equal(negotiation.thread.pending_offer.pay_unit, 'month')

  await threads.threadAction(clientId, {
    action: 'respond_offer',
    escrow_id: created.escrow.id,
    offer_id: negotiation.thread.pending_offer.id,
    status: 'accepted',
  })

  const accepted = await myDeals.respondApplicationDeal(
    clientId,
    clientHatId,
    created.application.id,
    'accepted',
  )
  assert.equal(accepted.application.status, 'accepted')
  assert.equal(accepted.escrow.amount, 55000)
  assert.equal(accepted.escrow.pay_unit, 'month')
  assert.equal(accepted.escrow.contacts_unlocked, true)
  assert.ok(accepted.escrow.agreed_at)
})

test('decline and withdrawal preserve the price, including after negotiability changes', async () => {
  const pending = await offer(clientId)
  await pool.query('UPDATE hats SET price_negotiable = false WHERE id = $1', [hatId])
  await respond(talentId, pending.id, 'declined')
  assert.equal((await state()).amount, 10000)
  await assert.rejects(offer(clientId), { status: 409 })
  await pool.query('UPDATE hats SET price_negotiable = true WHERE id = $1', [hatId])
  const next = await offer(clientId)
  await respond(clientId, next.id, 'withdrawn')
  assert.equal((await state()).amount, 10000)
})

test('wallet uses accepted price and QR checkpoints credit talent once in two stages', async () => {
  await accept()
  const pending = await offer(talentId, 8500)
  await respond(clientId, pending.id, 'accepted')
  await assert.rejects(checkout.payBookingWithWallet(clientId, escrowId, 10000), { status: 409 })
  await assert.rejects(checkout.payBookingWithWallet(talentId, escrowId, 8500), { status: 403 })
  await checkout.payBookingWithWallet(clientId, escrowId, 8500)
  assert.equal((await state()).status, 'secured')
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [clientId])).rows[0].balance, 91500)
  await assert.rejects(checkout.payBookingWithWallet(clientId, escrowId, 8500), { status: 409 })
  await send(clientId, 'a@example.com')
  assert.equal((await threads.getThread(clientId, escrowId)).thread.peer.phone, '08012345678')
  const releaseHandler = (await import('../api/escrows/[id]/[action].js')).default
  const lifecycle = (await import('../api/_lib/bookingLifecycle.js')).bookingLifecycle
  const { issueBookingQr, redeemBookingQr } = await import('../api/_lib/bookingQr.js')
  const start = await issueBookingQr(clientId, escrowId, 'start')
  await redeemBookingQr(talentId, escrowId, start.token)
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [talentId])).rows[0].balance, 2550)
  await lifecycle(talentId, escrowId, 'submit_delivery', { expected_version: 1, note: 'Completed the edit.', client_token: randomUUID() })
  const releaseBody = { expected_version: 2, note: 'Approved.', client_token: randomUUID() }
  assert.equal((await request(releaseHandler, clientId, 'POST', '', releaseBody, { id: escrowId, action: 'release' })).status, 200)
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [talentId])).rows[0].balance, 2550)
  assert.equal((await request(releaseHandler, clientId, 'POST', '', releaseBody, { id: escrowId, action: 'release' })).body.alreadyProcessed, true)
  const finish = await issueBookingQr(clientId, escrowId, 'completion')
  await redeemBookingQr(talentId, escrowId, finish.token)
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [talentId])).rows[0].balance, 8500)
})

test('legacy card checkout enters wallet first, then funds escrow from wallet', async () => {
  await accept()
  const prepared = await checkout.prepareCheckout(clientId, escrowId, 10000)
  assert.equal((await checkout.prepareCheckout(clientId, escrowId, 10000)).reference, prepared.reference)
  await assert.rejects(offer(clientId), { status: 409 })
  await assert.rejects(payments.applyVerifiedPayment({ escrowId, reference: 'other', txn: txn('other') }), { status: 409 })
  await assert.rejects(payments.applyVerifiedPayment({ escrowId, reference: prepared.reference, txn: txn(prepared.reference, 999999) }), { status: 402 })

  const payment = { escrowId, reference: prepared.reference, txn: txn(prepared.reference) }
  assert.equal((await payments.applyVerifiedPayment(payment)).alreadyProcessed, false)
  assert.equal((await payments.applyVerifiedPayment(payment)).alreadyProcessed, true)

  const { rows: ledger } = await pool.query(
    `SELECT type, amount FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at, id`,
    [clientId],
  )
  assert.deepEqual(
    ledger.map((row) => [row.type, row.amount]).sort(([a], [b]) => a.localeCompare(b)),
    [
      ['escrow_fund', 10000],
      ['topup', 10000],
    ],
  )
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [clientId])).rows[0].balance, 100000)

  const other = randomUUID()
  await assert.rejects(payments.applyVerifiedPayment({ ...payment, txn: { ...payment.txn, metadata: { escrow_id: other } } }), { status: 402 })
})

test('wallet funding is allowed after an abandoned legacy checkout was started', async () => {
  await accept()
  await checkout.prepareCheckout(clientId, escrowId, 10000)
  await checkout.payBookingWithWallet(clientId, escrowId, 10000)
  assert.equal((await state()).status, 'secured')
  assert.equal((await state()).checkout_reference, null)
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [clientId])).rows[0].balance, 90000)
})

test('competing funding requests debit the wallet only once', async () => {
  await accept()
  const results = await Promise.allSettled([
    checkout.payBookingWithWallet(clientId, escrowId, 10000),
    checkout.payBookingWithWallet(clientId, escrowId, 10000),
  ])
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  assert.equal((await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [clientId])).rows[0].balance, 90000)
})

test('concurrent offers and checkout cannot leave an open offer against a locked price', async () => {
  await accept()
  const results = await Promise.allSettled([offer(talentId), checkout.prepareCheckout(clientId, escrowId, 10000)])
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1)
  const current = await state()
  const { rows } = await pool.query(`SELECT id FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`, [escrowId])
  assert.equal(Boolean(current.checkout_locked_at) && rows.length > 0, false)
})

test('pagination covers history, and cancelled bookings are read-only with contacts hidden', async () => {
  for (let n = 0; n < 55; n++) {
    await pool.query(`INSERT INTO booking_messages (escrow_id, sender_id, recipient_id, kind, body, client_token)
      VALUES ($1, $2, $3, 'message', $4, $5)`, [escrowId, clientId, talentId, `Message ${n}`, randomUUID()])
  }
  const recent = await threads.getThread(clientId, escrowId)
  const older = await threads.getThread(clientId, escrowId, recent.nextCursor)
  assert.equal(recent.messages.length, 50)
  assert.equal(older.messages.length, 5)
  assert.equal(new Set([...recent.messages, ...older.messages].map((m) => m.id)).size, 55)
  await pool.query(`UPDATE escrows SET status = 'cancelled', contacts_unlocked = true WHERE id = $1`, [escrowId])
  await assert.rejects(send(talentId), { status: 409 })
  assert.equal((await threads.getThread(talentId, escrowId)).thread.peer.email, null)
})

test('rate limit rejects excess sends and rolls back a counteroffer', async () => {
  const pending = await offer(clientId)
  for (let n = 0; n < 19; n++) await send(clientId)
  await assert.rejects(offer(clientId, 9000, pending.id), { status: 429 })
  assert.equal((await threads.getThread(talentId, escrowId)).thread.pending_offer.id, pending.id)
})

async function request(fn, userId, method, url, body = {}, query = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = method; req.url = url; req.query = query
  req.headers = { host: 'localhost', ...(userId ? { cookie: `cw_session=${signSession({ sub: userId })}` } : {}) }
  let response
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value },
    end(value) { response = { status: this.statusCode, body: JSON.parse(value), headers: this.headers } } }
  await fn(req, res)
  return response
}

test('HTTP dispatch enforces auth, validation, no-store, and booking ownership', async () => {
  assert.equal((await request(handler, null, 'GET', '/api/escrows?conversations=1')).status, 401)
  assert.equal((await request(handler, clientId, 'GET', '/api/escrows?messages=1&escrow_id=bad')).status, 400)
  const inbox = await request(handler, clientId, 'GET', '/api/escrows?conversations=1')
  assert.equal(inbox.status, 200)
  assert.equal(inbox.headers['Cache-Control'], 'private, no-store')
  assert.equal((await request(handler, clientId, 'POST', '/api/escrows', { action: 'unknown' })).status, 400)
  const duplicate = await request(handler, clientId, 'POST', '/api/escrows', { hat_id: hatId, talent_id: outsiderId })
  assert.equal(duplicate.body.escrow.talent_id, talentId)
  assert.equal(duplicate.body.already_exists, true)
  const outsiderThread = await request(handler, outsiderId, 'GET', `/api/escrows?messages=1&escrow_id=${escrowId}`)
  assert.equal(outsiderThread.status, 404)
})

test('admin cancellation cannot race a started checkout', async () => {
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [clientId])
  const adminHandler = (await import('../api/admin/index.js')).default
  const cancel = () => request(adminHandler, clientId, 'POST', '/api/admin', { action: 'cancel_unfunded_escrow', escrowId })
  assert.equal((await cancel()).status, 200)
  assert.equal((await state()).status, 'cancelled')
  escrowId = randomUUID()
  await pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount)
    VALUES ($1, $2, $3, $4, 10000)`, [escrowId, hatId, clientId, talentId])
  await accept()
  await checkout.prepareCheckout(clientId, escrowId, 10000)
  assert.equal((await cancel()).status, 409)
  assert.equal((await state()).status, 'not_funded')
})
