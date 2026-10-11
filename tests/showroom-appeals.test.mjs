import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './database.mjs'

let db, pool, showroom, admin, hatHandler, signSession
const people = Array.from({ length: 5 }, () => randomUUID())
const hatId = randomUUID()

before(async () => {
  db = await testDatabase()
  pool = db.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'showroom-appeal-test-only'
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  // The standalone patch is intentionally safe on a fresh schema as well.
  await pool.query(await readFile(new URL('../db/showroom-appeals.sql', import.meta.url), 'utf8'))
  signSession = (await import('../api/_lib/auth.js')).signSession
  showroom = (await import('../api/showroom/index.js')).default
  admin = (await import('../api/admin/index.js')).default
  hatHandler = (await import('../api/hats/[id].js')).default
  for (let i = 0; i < people.length; i++) {
    await pool.query(
      `INSERT INTO users (id, full_name, username, email, password_hash, role, is_admin)
       VALUES ($1,$2,$3,$4,'fake-hash','dual',$5)`,
      [people[i], `Moderator test ${i}`, `showroomappeal${i}`, `showroomappeal${i}@test.invalid`, i === 4],
    )
  }
  await pool.query(
    `INSERT INTO hats (id, user_id, username, hat_title, hat_name, category, role, active)
     VALUES ($1,$2,'showroomappeal0','Wedding photographer','Photography','Film','talent',true)`,
    [hatId, people[0]],
  )
  await pool.query(
    `INSERT INTO hat_media (hat_id,url,public_id,type)
     VALUES ($1,'https://example.test/photo.jpg','appeal-cover','image')`, [hatId],
  )
})
after(async () => { await db?.close(); delete global.__tworldPool })

async function request(handler, url, { who = null, method = 'GET', body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, {
    method, url,
    headers: { host: 'localhost', cookie: who === null ? '' : `cw_session=${signSession({ sub: people[who] })}` },
  })
  const res = { statusCode: 200, setHeader() {}, end(message) { this.body = JSON.parse(message) } }
  await handler(req, res)
  return res
}

test('flagged listings are held out of Showroom automatically, without disabling existing deals', async () => {
  let feed = await request(showroom, '/api/showroom?view=new')
  assert.equal(feed.statusCode, 200, JSON.stringify(feed.body))
  assert.ok(feed.body.hats.some(h => h.id === hatId))
  const report = { action: 'report', hat_id: hatId, reason: 'spam' }
  for (let i = 1; i < 4; i++) {
    const result = await request(showroom, '/api/showroom', { who: i, method: 'POST', body: report })
    assert.equal(result.statusCode, 200)
  }
  feed = await request(showroom, '/api/showroom?view=new')
  assert.equal(feed.statusCode, 200)
  assert.ok(!feed.body.hats.some(h => h.id === hatId))
  assert.equal((await pool.query('SELECT active FROM hats WHERE id = $1', [hatId])).rows[0].active, true)
  assert.equal((await request(admin, '/api/admin?action=showroom_reports', { who: 4 })).body.flagged, 1)
  const ownerStatus = await request(showroom, '/api/showroom?action=my_moderation', { who: 0 })
  assert.equal(ownerStatus.body.items[0].moderation_status, 'flagged')
})

test('an owner cannot appeal a pending flag, but can appeal an admin restriction', async () => {
  const appeal = { action: 'appeal', hat_id: hatId, explanation: 'This is my original photography portfolio. Please check the uploaded images.' }
  assert.equal((await request(showroom, '/api/showroom', { who: 0, method: 'POST', body: appeal })).statusCode, 404)
  const restricted = await request(admin, '/api/admin', {
    who: 4, method: 'POST', body: { action: 'resolve_showroom_report', hatId, decision: 'restrict' },
  })
  assert.equal(restricted.statusCode, 200, JSON.stringify(restricted.body))
  assert.equal((await pool.query('SELECT active FROM hats WHERE id = $1', [hatId])).rows[0].active, false)
  assert.equal((await request(showroom, '/api/showroom', { who: 1, method: 'POST', body: appeal })).statusCode, 404)
  assert.equal((await request(showroom, '/api/showroom', { method: 'POST', body: appeal })).statusCode, 401)
  const result = await request(showroom, '/api/showroom', { who: 0, method: 'POST', body: appeal })
  assert.equal(result.statusCode, 201, JSON.stringify(result.body))
  assert.equal(result.body.appeal.status, 'pending')
  assert.equal((await request(showroom, '/api/showroom', { who: 0, method: 'POST', body: appeal })).statusCode, 409)
  const own = await request(showroom, '/api/showroom?action=my_moderation', { who: 0 })
  assert.equal(own.body.items[0].appeal_status, 'pending')
  assert.equal((await request(showroom, '/api/showroom?action=my_moderation', { who: 1 })).body.items.length, 0)
  assert.equal((await request(admin, '/api/admin?action=showroom_appeals', { who: 1 })).statusCode, 403)
})

test('owner edits cannot silently reactivate a restricted listing, but appeal approval can', async () => {
  const edit = await request(hatHandler, `/api/hats/${hatId}`, {
    who: 0, method: 'PUT', body: { active: true, motto: 'Studio photography available' },
  })
  assert.equal(edit.statusCode, 200, JSON.stringify(edit.body))
  assert.equal((await pool.query('SELECT active FROM hats WHERE id = $1', [hatId])).rows[0].active, false)
  const queue = await request(admin, '/api/admin?action=showroom_appeals', { who: 4 })
  assert.equal(queue.statusCode, 200)
  assert.equal(queue.body.pending, 1)
  const approved = await request(admin, '/api/admin', {
    who: 4, method: 'POST',
    body: { action: 'resolve_showroom_appeal', appealId: queue.body.items[0].id, decision: 'approve', note: 'Portfolio reviewed.' },
  })
  assert.equal(approved.statusCode, 200, JSON.stringify(approved.body))
  assert.equal((await pool.query('SELECT active FROM hats WHERE id = $1', [hatId])).rows[0].active, true)
  assert.ok((await request(showroom, '/api/showroom?view=new')).body.hats.some(h => h.id === hatId))
  assert.equal((await request(admin, '/api/admin?action=showroom_appeals', { who: 4 })).body.pending, 0)
  assert.equal((await request(showroom, '/api/showroom?action=my_moderation', { who: 0 })).body.items.length, 0)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action = 'resolve_showroom_appeal'")).rows[0].n, 1)
})
