import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
const migration = await readFile(new URL('../db/booking-completion.sql', import.meta.url), 'utf8')
let database, pool, lifecycle, threads, checkout, payments, handler, adminHandler, signSession
let clientId, talentId, adminId, outsiderId, hatId, escrowId
before(async () => {
  database = await testDatabase(); pool = database.pool; global.__tworldPool = pool
  process.env.JWT_SECRET = 'completion-test-only'
  await pool.query(schema)
  lifecycle = (await import('../api/_lib/bookingLifecycle.js')).bookingLifecycle
  threads = await import('../api/_lib/bookingThreads.js')
  checkout = await import('../api/_lib/bookingCheckout.js')
  payments = await import('../api/_lib/escrowPayments.js')
  handler = (await import('../api/escrows/[id]/[action].js')).default
  adminHandler = (await import('../api/admin/index.js')).default
  signSession = (await import('../api/_lib/auth.js')).signSession
})
after(async () => { await database?.close(); delete global.__tworldPool })
beforeEach(async () => {
  await pool.query('TRUNCATE users CASCADE')
  clientId = randomUUID(); talentId = randomUUID(); adminId = randomUUID(); outsiderId = randomUUID(); hatId = randomUUID(); escrowId = randomUUID()
  for (const [id, name] of [[clientId, 'client'], [talentId, 'talent'], [adminId, 'admin'], [outsiderId, 'other']]) {
    await pool.query(`INSERT INTO users (id, full_name, username, email, password_hash, is_admin)
      VALUES ($1, $2, $2, $3, 'test-only', $4)`, [id, name, `${name}@example.test`, id === adminId])
  }
  await pool.query(`INSERT INTO hats (id, user_id, username, hat_title, hat_name, category, rate) VALUES ($1, $2, 'talent', 'Editing', 'Editing', 'Film', 10000)`, [hatId, talentId])
  await pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount) VALUES ($1, $2, $3, $4, 10000)`, [escrowId, hatId, clientId, talentId])
  await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 50000)', [clientId])
})
const state = async () => (await pool.query('SELECT * FROM escrows WHERE id = $1', [escrowId])).rows[0]
const balance = async (id) => (await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [id])).rows[0]?.balance || 0
const payload = (expected_version, note = 'Completed the agreed work.') => ({ expected_version, note, client_token: randomUUID() })
const fund = () => checkout.payBookingWithWallet(clientId, escrowId, 10000)
const act = (user, action, version, note) => lifecycle(user, escrowId, action, payload(version, note), action.startsWith('resolve_'))
const open = async () => { await fund(); await act(clientId, 'open_dispute', 0, 'The work was not delivered as agreed.') }

async function http(fn, user, body = {}, action = 'submit_delivery', url = '/api/admin') {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = url.includes('?') ? 'GET' : 'POST'; req.url = url; req.query = { id: escrowId, action }
  req.headers = { host: 'localhost', ...(user ? { cookie: `cw_session=${signSession({ sub: user })}` } : {}) }
  let response
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(value) { response = { status: this.statusCode, body: JSON.parse(value), headers: this.headers } } }
  await fn(req, res); return response
}

test('delivery, revision, resubmission and approval settle the agreed amount exactly once', async () => {
  await fund()
  await act(talentId, 'submit_delivery', 0)
  await act(clientId, 'request_revision', 1, 'Please correct the colours.')
  await act(talentId, 'submit_delivery', 2, 'Colour corrections complete.')
  const request = payload(3, 'Approved.')
  await lifecycle(clientId, escrowId, 'approve_delivery', request)
  assert.equal((await lifecycle(clientId, escrowId, 'approve_delivery', request)).alreadyProcessed, true)
  assert.equal((await state()).work_status, 'completed')
  assert.equal(await balance(talentId), 10000)
  assert.equal(await balance(clientId), 40000)
  const history = await threads.getThread(clientId, escrowId)
  assert.deepEqual(history.events.map((e) => e.action), ['submit_delivery', 'request_revision', 'submit_delivery', 'approve_delivery'])
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type = 'escrow_release'")).rows[0].n, 1)
})

test('funding, participation and actor roles are required for every transition', async () => {
  await assert.rejects(act(talentId, 'submit_delivery', 0), { status: 409 })
  await fund()
  await assert.rejects(act(outsiderId, 'submit_delivery', 0), { status: 404 })
  await assert.rejects(act(clientId, 'submit_delivery', 0), { status: 403 })
  await assert.rejects(act(clientId, 'approve_delivery', 0), { status: 409 })
  await act(talentId, 'submit_delivery', 0)
  await assert.rejects(act(talentId, 'approve_delivery', 1), { status: 403 })
  await assert.rejects(act(talentId, 'request_revision', 1), { status: 403 })
  await assert.rejects(act(talentId, 'submit_delivery', 1), { status: 409 })
  assert.equal(await balance(talentId), 0)
})

test('stale revisions cannot apply to a newer delivery; token reuse cannot change the operation', async () => {
  await fund()
  const request = payload(0)
  await lifecycle(talentId, escrowId, 'submit_delivery', request)
  await assert.rejects(lifecycle(talentId, escrowId, 'submit_delivery', { ...request, note: 'Different work' }), { status: 409 })
  await act(clientId, 'request_revision', 1)
  await act(talentId, 'submit_delivery', 2)
  await assert.rejects(act(clientId, 'request_revision', 1), { status: 409 })
  assert.equal((await state()).work_status, 'submitted')
})

test('disputes hold funds, preserve evidence, notify admins and block all normal releases', async () => {
  await open()
  for (const [user, action] of [[talentId, 'submit_delivery'], [clientId, 'request_revision'], [clientId, 'approve_delivery'], [talentId, 'open_dispute']]) {
    await assert.rejects(act(user, action, 1), { status: 409 })
  }
  await threads.threadAction(talentId, { action: 'send_message', escrow_id: escrowId, client_token: randomUUID(), body: 'Here is evidence of the delivery.' })
  assert.equal((await state()).status, 'secured')
  assert.equal(await balance(talentId), 0)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'booking_dispute'", [adminId])).rows[0].n, 1)
  // A cached pre-upgrade release handler cannot bypass the database state check.
  await assert.rejects(pool.query("UPDATE escrows SET status = 'released' WHERE id = $1", [escrowId]), { code: '23514' })
  assert.equal((await http(handler, clientId, {}, 'release', '/api/escrows/id/release')).status, 400)
  assert.equal((await http(handler, clientId, payload(1), 'release', '/api/escrows/id/release')).status, 409)
})

test('admin refund restores the client wallet with a reason and atomic audit; no self resolution', async () => {
  await open()
  await assert.rejects(act(outsiderId, 'resolve_refund', 1), { status: 403 })
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [clientId])
  await assert.rejects(act(clientId, 'resolve_refund', 1), { status: 403 })
  const request = payload(1, 'Both parties agreed the service was not delivered.')
  await lifecycle(adminId, escrowId, 'resolve_refund', request, true)
  assert.equal((await lifecycle(adminId, escrowId, 'resolve_refund', request, true)).alreadyProcessed, true)
  assert.equal(await balance(clientId), 50000)
  assert.equal(await balance(talentId), 0)
  assert.equal((await state()).status, 'refunded')
  assert.equal((await state()).contacts_unlocked, false)
  const audit = (await pool.query('SELECT * FROM admin_audit_logs')).rows
  assert.equal(audit.length, 1); assert.equal(audit[0].metadata.reason, request.note)
  const dispute = (await pool.query('SELECT * FROM booking_disputes')).rows[0]
  assert.equal(dispute.status, 'refunded'); assert.equal(dispute.resolved_by, adminId)
  await assert.rejects(act(adminId, 'resolve_release', 2), { status: 409 })
  await assert.rejects(threads.threadAction(clientId, { action: 'send_message', escrow_id: escrowId, client_token: randomUUID(), body: 'More' }), { status: 409 })
  assert.equal((await threads.getThread(talentId, escrowId)).thread.peer.email, null)
})

test('admin release pays talent; competing admin release/refund can settle only once', async () => {
  await open()
  const results = await Promise.allSettled([act(adminId, 'resolve_release', 1), act(adminId, 'resolve_refund', 1)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const e = await state()
  assert.ok(['released', 'refunded'].includes(e.status))
  assert.equal((await balance(talentId)) + (await balance(clientId)), 50000)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE type IN ('escrow_release', 'refund')")).rows[0].n, 1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM admin_audit_logs')).rows[0].n, 1)
})

test('competing client approval and dispute never leave an open dispute against released funds', async () => {
  await fund(); await act(talentId, 'submit_delivery', 0)
  const results = await Promise.allSettled([act(clientId, 'approve_delivery', 1), act(talentId, 'open_dispute', 1)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const e = await state()
  const disputes = (await pool.query('SELECT * FROM booking_disputes')).rows
  assert.equal(e.status === 'released' && disputes.some((d) => d.status === 'open'), false)
  if (e.work_status === 'disputed') assert.equal(await balance(talentId), 0)
})

test('an audit failure rolls back wallet credit, dispute, events and notifications', async () => {
  await open()
  await pool.query("ALTER TABLE admin_audit_logs ADD CONSTRAINT reject_test_resolution CHECK (action <> 'resolve_refund')")
  try {
    await assert.rejects(act(adminId, 'resolve_refund', 1), { code: '23514' })
    assert.equal(await balance(clientId), 40000)
    assert.equal((await state()).work_status, 'disputed')
    assert.equal((await pool.query('SELECT status FROM booking_disputes')).rows[0].status, 'open')
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM booking_events WHERE action = 'resolve_refund'")).rows[0].n, 0)
  } finally { await pool.query('ALTER TABLE admin_audit_logs DROP CONSTRAINT reject_test_resolution') }
})

test('replayed Paystack callbacks after refund remain no-ops', async () => {
  const { reference } = await checkout.prepareCheckout(clientId, escrowId, 10000)
  const payment = { escrowId, reference, txn: { reference, status: 'success', currency: 'NGN', amount: 1000000, metadata: { escrow_id: escrowId } } }
  await payments.applyVerifiedPayment(payment)
  await act(talentId, 'open_dispute', 0)
  await act(adminId, 'resolve_refund', 1)
  assert.equal((await payments.applyVerifiedPayment(payment)).alreadyProcessed, true)
  assert.equal((await state()).status, 'refunded'); assert.equal(await balance(clientId), 60000)
})

test('HTTP authentication, admin scope, validation and no-store apply to new actions and evidence', async () => {
  await open()
  assert.equal((await http(handler, null, payload(1))).status, 401)
  assert.equal((await http(handler, outsiderId, payload(1))).status, 404)
  assert.equal((await http(handler, talentId, { ...payload(1), expected_version: '1' })).status, 400)
  const url = `/api/admin?action=dispute&escrow_id=${escrowId}`
  assert.equal((await http(adminHandler, clientId, {}, '', url)).status, 403)
  assert.equal((await http(adminHandler, null, {}, '', url)).status, 401)
  const result = await http(adminHandler, adminId, {}, '', url)
  assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.equal(result.body.dispute.escrow_id, escrowId)
  const resolved = await http(adminHandler, adminId, { ...payload(1, 'Refund justified by evidence.'), action: 'resolve_refund', escrow_id: escrowId })
  assert.equal(resolved.status, 200)
  assert.equal((await http(adminHandler, adminId, {}, '', '/api/admin?action=disputes&status=refunded')).body.disputes.length, 1)
})

test('blank/oversized notes are rejected without changing funded bookings', async () => {
  await fund()
  for (const note of ['', ' ', 'x'.repeat(2001), {}, 2]) {
    await assert.rejects(lifecycle(talentId, escrowId, 'submit_delivery', payload(0, note)), { status: 400 })
  }
  assert.equal((await state()).work_version, 0)
})

test('participants and admins can page all lifecycle evidence without leaking unrelated bookings', async () => {
  await open()
  for (let n = 10; n < 65; n++) await pool.query(
    `INSERT INTO booking_events (escrow_id, actor_id, action, note, expected_version, client_token)
     VALUES ($1, $2, 'submit_delivery', $3, $4, $5)`, [escrowId, talentId, `Historical delivery ${n}`, n, randomUUID()],
  )
  const recent = await threads.getThread(clientId, escrowId)
  const older = await threads.getThread(clientId, escrowId, null, recent.eventsCursor)
  assert.equal(recent.events.length, 50); assert.equal(older.events.length, 6)
  assert.equal(new Set([...recent.events, ...older.events].map((e) => e.id)).size, 56)
  for (let n = 0; n < 55; n++) await pool.query(
    `INSERT INTO booking_messages (escrow_id, sender_id, recipient_id, kind, body, client_token)
     VALUES ($1, $2, $3, 'message', $4, $5)`, [escrowId, talentId, clientId, `Evidence ${n}`, randomUUID()],
  )
  const url = `/api/admin?action=dispute&escrow_id=${escrowId}`
  const first = (await http(adminHandler, adminId, {}, '', url)).body
  const next = (await http(adminHandler, adminId, {}, '', `${url}&before=${first.messagesCursor}&events_before=${first.eventsCursor}`)).body
  assert.equal(first.messages.length, 50); assert.equal(next.messages.length, 5)
  assert.equal(next.events.length, 6)
  assert.equal((await http(adminHandler, adminId, {}, '', `${url}&events_before=9999999999999999999`)).status, 400)
  assert.equal((await http(adminHandler, adminId, {}, '', `/api/admin?action=dispute&escrow_id=${randomUUID()}`)).status, 404)
})

test('dispute queue pagination survives the cursor case being resolved by another admin', async () => {
  await open()
  for (let n = 0; n < 52; n++) {
    const id = randomUUID()
    await pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount, status, work_status)
      VALUES ($1, $2, $3, $4, 100, 'secured', 'disputed')`, [id, hatId, clientId, talentId])
    await pool.query(`INSERT INTO booking_disputes (escrow_id, opened_by, reason) VALUES ($1, $2, 'Test case')`, [id, clientId])
  }
  const url = '/api/admin?action=disputes&status=open'
  const first = (await http(adminHandler, adminId, {}, '', url)).body
  const next = (await http(adminHandler, adminId, {}, '', `${url}&before=${first.nextCursor}`)).body
  assert.equal(first.disputes.length, 50); assert.equal(next.disputes.length, 3)
  assert.equal(new Set([...first.disputes, ...next.disputes].map((d) => d.escrow_id)).size, 53)
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [outsiderId])
  const boundary = (await pool.query('SELECT work_version FROM escrows WHERE id = $1', [first.nextCursor])).rows[0]
  await lifecycle(outsiderId, first.nextCursor, 'resolve_refund', payload(boundary.work_version, 'Refund agreed during case review.'), true)
  const afterResolution = (await http(adminHandler, adminId, {}, '', `${url}&before=${first.nextCursor}`)).body
  assert.deepEqual(afterResolution.disputes.map((d) => d.escrow_id), next.disputes.map((d) => d.escrow_id))
})

test('standalone and full migrations rerun over refunded data without changing balances or history', async () => {
  assert.ok(schema.includes(migration.split('BEGIN;\n')[1].replace(/COMMIT;\s*$/, '').trim()))
  await open(); await act(adminId, 'resolve_refund', 1)
  await pool.query(migration); await pool.query(schema); await pool.query(migration)
  assert.equal((await state()).status, 'refunded')
  assert.equal((await state()).work_version, 2)
  assert.equal(await balance(clientId), 50000)
  assert.equal((await threads.getThread(clientId, escrowId)).events.length, 2)
})

test('legacy released bookings migrate as completed; legacy role constraint is removed before conversion', async () => {
  await pool.query('ALTER TABLE escrows DROP CONSTRAINT escrows_work_state_check')
  await pool.query('ALTER TABLE escrows DROP COLUMN work_status')
  await pool.query("UPDATE escrows SET status = 'released' WHERE id = $1", [escrowId])
  await pool.query(migration)
  assert.equal((await state()).work_status, 'completed')
  await pool.query(`ALTER TABLE users DROP CONSTRAINT users_role_check;
    UPDATE users SET role = 'creator';
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('creator', 'employer', 'dual'));
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'creator';`)
  await pool.query(schema)
  assert.equal((await pool.query('SELECT role FROM users WHERE id = $1', [talentId])).rows[0].role, 'talent')
  assert.equal((await pool.query('SELECT is_admin FROM users WHERE id = $1', [adminId])).rows[0].is_admin, true)
})

test('unknown legacy roles cause an atomic migration failure without rewriting accounts', async () => {
  await pool.query(`ALTER TABLE users DROP CONSTRAINT users_role_check; UPDATE users SET role = 'legacy_unknown' WHERE id = '${outsiderId}'`)
  try {
    await assert.rejects(pool.query(schema), { code: '23514' })
    await pool.query('ROLLBACK')
    assert.equal((await pool.query('SELECT role FROM users WHERE id = $1', [outsiderId])).rows[0].role, 'legacy_unknown')
  } finally {
    await pool.query("UPDATE users SET role = 'dual' WHERE id = $1", [outsiderId]); await pool.query(schema)
  }
})
