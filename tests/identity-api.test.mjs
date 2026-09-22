import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

// The identity display (src/lib/profile.js) needs a person's full name, account
// role and — for Clients — legal suffix next to their username. These check
// that the read-only queries behind Showroom, the feed, bookings, Messages and
// the wallet hand those over. Display only: nothing here changes what is stored.
const database = await testDatabase()
global.__tworldPool = database.pool
process.env.JWT_SECRET = 'identity-api-test-secret'
const { pool } = database
after(() => database.close())

const ids = {
  talent: '11111111-1111-4111-8111-111111111111',
  client: '22222222-2222-4222-8222-222222222222',
  talentHat: '33333333-3333-4333-8333-333333333333',
  clientHat: '44444444-4444-4444-8444-444444444444',
  escrow: '55555555-5555-4555-8555-555555555555',
}
const { signSession } = await import('../api/_lib/auth.js')

async function get(modulePath, url, who) {
  const handler = (await import(modulePath)).default
  const res = {
    statusCode: 200,
    setHeader() {},
    end(body) { this.body = body },
  }
  const req = { method: 'GET', url, query: {}, headers: { host: 'localhost', cookie: who ? `cw_session=${signSession({ sub: ids[who] })}` : '' }, on() {} }
  await handler(req, res)
  assert.equal(res.statusCode, 200, `${url}: ${res.body}`)
  return JSON.parse(res.body)
}

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  await pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash, role)
    VALUES ($1, 'Sarverun Simeon Tertese', 'simeon', 'talent@example.test', '08011111111', 'x', 'talent')`, [ids.talent])
  await pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash, role, company_suffix)
    VALUES ($1, 'Simeon Laboratories', 'silabs', 'client@example.test', '08022222222', 'x', 'client', 'Ltd.')`, [ids.client])
  await pool.query(`INSERT INTO hats (id, user_id, hat_title, hat_name, username, category, rate, role, active)
    VALUES ($1, $2, 'Wedding Photographer', 'Wedding Photographer', 'simeon', 'Film', 25000, 'talent', true)`, [ids.talentHat, ids.talent])
  await pool.query(`INSERT INTO hats (id, user_id, hat_title, hat_name, username, category, rate, role, active)
    VALUES ($1, $2, 'Need a photographer', 'Need a photographer', 'silabs', 'Film', 30000, 'client', true)`, [ids.clientHat, ids.client])
  await pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount) VALUES ($1, $2, $3, $4, 10000)`,
    [ids.escrow, ids.talentHat, ids.client, ids.talent])
  await pool.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 50000)`, [ids.client])
  const { payBookingWithWallet } = await import('../api/_lib/bookingCheckout.js')
  await payBookingWithWallet(ids.client, ids.escrow, 10000)
})

test('Showroom posts carry the owner name, account role and suffix', async () => {
  const { hats } = await get('../api/showroom/index.js', '/api/showroom')
  assert.equal(hats[0].username, 'simeon')
  assert.equal(hats[0].owner_full_name, 'Sarverun Simeon Tertese')
  assert.equal(hats[0].owner_role, 'talent')
})

test('feed cards carry the Client business name and suffix separately', async () => {
  const { hats } = await get('../api/hats/index.js', '/api/hats?role=client', 'talent')
  assert.equal(hats[0].owner_full_name, 'Simeon Laboratories')
  assert.equal(hats[0].owner_role, 'client')
  assert.equal(hats[0].owner_company_suffix, 'Ltd.')
  assert.equal(hats[0].username, 'silabs') // the stored username is untouched
})

test('bookings, conversations and threads identify the other person fully', async () => {
  const mine = await get('../api/escrows/index.js', '/api/escrows?mine=1', 'client')
  const booking = (mine.escrows || mine.bookings)[0]
  assert.deepEqual(
    [booking.talent_username, booking.talent_full_name, booking.talent_role],
    ['simeon', 'Sarverun Simeon Tertese', 'talent'],
  )

  const conversations = await get('../api/escrows/index.js', '/api/escrows?conversations=1', 'talent')
  const conversation = (conversations.conversations || conversations.items)[0]
  assert.deepEqual(
    [conversation.peer_username, conversation.peer_full_name, conversation.peer_role, conversation.peer_company_suffix],
    ['silabs', 'Simeon Laboratories', 'client', 'Ltd.'],
  )

  const { thread } = await get('../api/escrows/index.js', `/api/escrows?messages=1&escrow_id=${ids.escrow}`, 'talent')
  assert.deepEqual(
    [thread.peer.username, thread.peer.full_name, thread.peer.role, thread.peer.company_suffix],
    ['silabs', 'Simeon Laboratories', 'client', 'Ltd.'],
  )
})

test('wallet activity names the counterparty of a booking payment', async () => {
  const { wallet } = await get('../api/escrows/index.js', '/api/escrows?wallet=1', 'client')
  const payment = wallet.transactions.find((t) => t.type === 'escrow_fund')
  assert.equal(payment.counterparty_username, 'simeon')
  assert.equal(payment.counterparty_full_name, 'Sarverun Simeon Tertese')
  assert.equal(payment.counterparty_role, 'talent')
})
