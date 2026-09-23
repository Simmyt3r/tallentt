import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

let database, pool, hatsHandler, hatHandler, showroomHandler, signSession
let owner, other, fixed, range, clientHat
const migration = await readFile(new URL('../db/hat-feed-visibility.sql', import.meta.url), 'utf8')

before(async () => {
  database = await testDatabase()
  pool = database.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'hat-feed-test-only'
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  hatsHandler = (await import('../api/hats/index.js')).default
  hatHandler = (await import('../api/hats/[id].js')).default
  showroomHandler = (await import('../api/showroom/index.js')).default
  signSession = (await import('../api/_lib/auth.js')).signSession
})
after(async () => { await database?.close(); delete global.__tworldPool })

beforeEach(async () => {
  await pool.query('TRUNCATE users CASCADE')
  owner = randomUUID(); other = randomUUID(); fixed = randomUUID(); range = randomUUID(); clientHat = randomUUID()
  for (const [id, name] of [[owner, 'owner'], [other, 'other']]) {
    await pool.query(`INSERT INTO users (id, full_name, username, email, password_hash)
      VALUES ($1, $2, $2, $3, 'test')`, [id, name, `${name}@example.test`])
  }
  for (const [id, type, role] of [[fixed, 'fixed', 'talent'], [range, 'range', 'talent'], [clientHat, 'range', 'client']]) {
    await pool.query(`INSERT INTO hats (id, user_id, hat_title, hat_name, username, category, price_type,
      rate, rate_unit, price_min, price_max, price_negotiable, role, hiring_duration)
      VALUES ($1, $2, 'Video editor', $3, 'owner', 'Film', $4, 10000, 'day', 10000, 20000, $5, $6, $7)`,
    [id, owner, `${role}-${type}`, type, type === 'range', role, role === 'client' ? '6 months' : null])
  }
})

async function request(handler, url, { method = 'GET', who = owner, body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url, headers: { host: 'localhost', cookie: who ? `cw_session=${signSession({ sub: who })}` : '' } })
  const res = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body) } }
  await handler(req, res)
  return res
}
const toggle = (id, visible, confirmed = false, who = owner) => request(hatHandler, `/api/hats/${id}`, {
  method: 'PATCH', who, body: { action: 'set_feed_visibility', feed_visible: visible, negotiation_fee_confirmed: confirmed },
})
const feed = async (suffix = '') => (await request(hatsHandler, `/api/hats?feed=1${suffix}`)).body.hats
const state = async (id) => (await pool.query('SELECT * FROM hats WHERE id = $1', [id])).rows[0]

test('new and existing Hats default off; migration is safe to repeat', async () => {
  await pool.query('ALTER TABLE hats DROP COLUMN feed_visible')
  await pool.query(migration)
  assert.deepEqual(await feed(), [])
  assert.equal((await state(fixed)).feed_visible, false)
  assert.equal((await toggle(fixed, true)).statusCode, 200)
  await pool.query(migration)
  assert.equal((await state(fixed)).feed_visible, true)
})

test('only opted-in active Hats enter the feed, including search and role filters', async () => {
  assert.equal((await toggle(fixed, true)).statusCode, 200)
  assert.equal((await toggle(clientHat, true, true)).statusCode, 200)
  assert.deepEqual((await feed('&role=talent&search=Video')).map((h) => h.id), [fixed])
  assert.deepEqual((await feed('&role=client')).map((h) => h.id), [clientHat])
  await pool.query('UPDATE hats SET active = false WHERE id = $1', [fixed])
  assert.equal((await feed('&role=talent')).length, 0)
  await toggle(clientHat, false)
  assert.equal((await feed()).length, 0)
})

test('legacy feed requests also exclude hidden Hats', async () => {
  for (const suffix of ['', '?role=talent', '?feed=0&role=talent']) {
    assert.deepEqual((await request(hatsHandler, `/api/hats${suffix}`)).body.hats, [])
  }
  await toggle(fixed, true)
  const legacy = await request(hatsHandler, '/api/hats?role=talent&search=Video')
  assert.deepEqual(legacy.body.hats.map((h) => h.id), [fixed])
  const scopedFeed = await feed(`&user_id=${owner}`)
  assert.deepEqual(scopedFeed.map((h) => h.id), [fixed])
})

test('hidden Hats remain in My Hats, Showroom and direct details', async () => {
  const mine = await request(hatsHandler, `/api/hats?user_id=${owner}`)
  assert.equal(mine.body.hats.length, 3)
  const showroom = await request(showroomHandler, '/api/showroom')
  assert.ok(showroom.body.hats.some((h) => h.id === range))
  assert.equal((await request(hatHandler, `/api/hats/${range}`)).body.hat.id, range)
  assert.deepEqual(await feed(), [])
})

test('Range publication requires explicit confirmation every time it is enabled', async () => {
  for (const id of [range, clientHat]) {
    for (const confirmation of [false, 'true']) {
      const res = await toggle(id, true, confirmation)
      assert.equal(res.statusCode, 409)
      assert.equal(res.body.code, 'NEGOTIATION_FEE_CONFIRMATION_REQUIRED')
      assert.equal((await state(id)).feed_visible, false)
    }
    assert.equal((await toggle(id, true, true)).statusCode, 200)
    assert.equal((await state(id)).feed_visible, true)
    assert.equal((await toggle(id, false)).statusCode, 200)
    assert.equal((await toggle(id, true)).statusCode, 409)
  }
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n, 0)
})

test('publication is owner-only and rejects non-boolean states', async () => {
  assert.equal((await toggle(fixed, true, false, null)).statusCode, 401)
  assert.equal((await toggle(fixed, true, false, other)).statusCode, 403)
  assert.equal((await toggle(fixed, 'false')).statusCode, 400)
  assert.equal((await state(fixed)).feed_visible, false)
})

test('ordinary editing cannot bypass opt-in and changing Fixed to Range unpublishes', async () => {
  const edit = (id, body) => request(hatHandler, `/api/hats/${id}`, { method: 'PUT', body })
  assert.equal((await edit(range, { feed_visible: true })).statusCode, 200)
  assert.equal((await state(range)).feed_visible, false)
  await toggle(fixed, true)
  assert.equal((await edit(fixed, { motto: 'Ready to work' })).statusCode, 200)
  assert.equal((await state(fixed)).feed_visible, true)
  assert.equal((await edit(fixed, { price_type: 'range', price_min: 10000, price_max: 25000, feed_visible: true })).statusCode, 200)
  assert.equal((await state(fixed)).feed_visible, false)
  assert.equal((await toggle(fixed, true)).statusCode, 409)
  await toggle(fixed, true, true)
  await edit(fixed, { price_min: 12000, price_max: 26000 })
  assert.equal((await state(fixed)).feed_visible, true)
})

const create = (fields = {}, who = owner) => request(hatsHandler, '/api/hats', { method: 'POST', who, body: {
    hat_title: 'Photographer', hat_name: 'Event photos', category: 'Film', role: 'client',
    hiring_duration: '6 months', price_type: 'range', price_min: 10000, price_max: 20000,
    ...fields,
  } })

test('create defaults to hidden and permits hidden Range Hats without confirmation', async () => {
  for (const fields of [{}, { feed_visible: false }]) {
    const res = await create(fields)
    assert.equal(res.statusCode, 201, JSON.stringify(res.body))
    assert.equal(res.body.hat.feed_visible, false)
  }
  assert.deepEqual(await feed(), [])
})

test('create publishes confirmed Range Hats with their owner and feed choice saved together', async () => {
  const res = await create({ feed_visible: true, negotiation_fee_confirmed: true, user_id: other })
  assert.equal(res.statusCode, 201, JSON.stringify(res.body))
  assert.equal(res.body.hat.feed_visible, true)
  assert.equal(res.body.hat.user_id, owner)
  assert.deepEqual((await feed()).map((h) => h.id), [res.body.hat.id])
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n, 0)
})

test('create rejects unconfirmed Range publication and malformed toggles before inserting', async () => {
  for (const confirmed of [undefined, false, 'true', 1]) {
    const res = await create({ feed_visible: true, negotiation_fee_confirmed: confirmed })
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.code, 'NEGOTIATION_FEE_CONFIRMATION_REQUIRED')
  }
  for (const value of ['true', 'false', 1, null]) {
    assert.equal((await create({ feed_visible: value, negotiation_fee_confirmed: true })).statusCode, 400)
  }
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats')).rows[0].n, 3)
})

test('create publishes Fixed Hats without a fee confirmation, for clients and talents', async () => {
  for (const role of ['client', 'talent']) {
    const res = await create({ feed_visible: true, price_type: 'fixed', rate: 10000, rate_unit: 'day', role,
      media: role === 'talent' ? [{ url: 'https://example.test/photo.jpg', public_id: 'portfolio', type: 'image' }] : [],
    })
    assert.equal(res.statusCode, 201, JSON.stringify(res.body))
    assert.equal(res.body.hat.feed_visible, true)
    assert.equal(res.body.hat.role, role)
  }
  assert.equal((await create({ feed_visible: true }, null)).statusCode, 401)
})
