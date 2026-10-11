import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './database.mjs'

let database, pool, showroom, admin, signSession
const users = Array.from({ length: 5 }, () => randomUUID())
const hatId = randomUUID()

before(async () => {
  database = await testDatabase()
  pool = database.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'showroom-report-test-only'
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  signSession = (await import('../api/_lib/auth.js')).signSession
  showroom = (await import('../api/showroom/index.js')).default
  admin = (await import('../api/admin/index.js')).default
  for (let index = 0; index < users.length; index++) {
    await pool.query(
      `INSERT INTO users (id, full_name, username, email, password_hash, role, is_admin)
       VALUES ($1,$2,$3,$4,'test','dual',$5)`,
      [users[index], `Test user ${index}`, `reporter${index}`, `reporter${index}@example.test`, index === 4],
    )
  }
  await pool.query(
    `INSERT INTO hats (id, user_id, username, hat_title, hat_name, category, role, active)
     VALUES ($1,$2,'reporter0','Live photographer','Photography','Film','talent',true)`,
    [hatId, users[0]],
  )
  await pool.query(
    `INSERT INTO hat_media (hat_id, url, public_id, type)
     VALUES ($1,'https://example.test/cover.jpg','report-cover','image')`,
    [hatId],
  )
})
after(async () => {
  await database?.close()
  delete global.__tworldPool
})

async function request(handler, url, { who = null, method = 'GET', body = null } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, {
    method, url,
    headers: {
      host: 'localhost',
      cookie: who == null ? '' : `cw_session=${signSession({ sub: users[who] })}`,
    },
  })
  const res = {
    statusCode: 200, setHeader() {},
    end(payload) { this.body = JSON.parse(payload) },
  }
  await handler(req, res)
  return res
}

test('reporting requires authentication and rejects self-reports and invalid reasons', async () => {
  const body = { action: 'report', hat_id: hatId, reason: 'contact_bypass' }
  assert.equal((await request(showroom, '/api/showroom', { method: 'POST', body })).statusCode, 401)
  assert.equal((await request(showroom, '/api/showroom', { who: 0, method: 'POST', body })).statusCode, 403)
  assert.equal((await request(showroom, '/api/showroom', {
    who: 1, method: 'POST', body: { ...body, reason: 'fake_reason' },
  })).statusCode, 400)
})

test('unique reports raise one exception only after three distinct reporters', async () => {
  const body = { action: 'report', hat_id: hatId, reason: 'spam' }
  for (let who = 1; who <= 3; who++) {
    const res = await request(showroom, '/api/showroom', { who, method: 'POST', body })
    assert.equal(res.statusCode, 200, JSON.stringify(res.body))
    assert.equal(res.body.alreadyReported, false)
    const queue = await request(admin, '/api/admin?action=showroom_reports', { who: 4 })
    assert.equal(queue.statusCode, 200)
    assert.equal(queue.body.flagged, who >= 3 ? 1 : 0)
  }
  const duplicate = await request(showroom, '/api/showroom', { who: 1, method: 'POST', body })
  assert.equal(duplicate.statusCode, 200)
  assert.equal(duplicate.body.alreadyReported, true)
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM showroom_reports WHERE hat_id = $1', [hatId])
  assert.equal(rows[0].count, 3)
  assert.equal((await request(admin, '/api/admin?action=showroom_reports', { who: 1 })).statusCode, 403)

  // Reports never auto-ban a creator. Admin handles the exceptional case.
  const { rows: active } = await pool.query('SELECT active FROM hats WHERE id = $1', [hatId])
  assert.equal(active[0].active, true)
})

test('admin dismissal clears the exception and records audit evidence', async () => {
  const res = await request(admin, '/api/admin', {
    who: 4, method: 'POST', body: { action: 'resolve_showroom_report', hatId, decision: 'dismiss' },
  })
  assert.equal(res.statusCode, 200, JSON.stringify(res.body))
  const queue = await request(admin, '/api/admin?action=showroom_reports', { who: 4 })
  assert.equal(queue.body.flagged, 0)
  const { rows } = await pool.query("SELECT action FROM admin_audit_logs WHERE action = 'resolve_showroom_report' AND target_id = $1", [hatId])
  assert.equal(rows.length, 1)
})
