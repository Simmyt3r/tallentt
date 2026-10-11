import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

let database, pool, hatHandler, hatsHandler, showroomHandler, signSession, validateHatPresentation
const owner = randomUUID()
const visitor = randomUUID()
const hatId = randomUUID()

before(async () => {
  database = await testDatabase()
  pool = database.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'hat-style-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  signSession = (await import('../api/_lib/auth.js')).signSession
  validateHatPresentation = (await import('../api/_lib/hatPresentation.js')).validateHatPresentation
  hatHandler = (await import('../api/hats/[id].js')).default
  hatsHandler = (await import('../api/hats/index.js')).default
  showroomHandler = (await import('../api/showroom/index.js')).default
  for (const [id, username] of [[owner, 'creator'], [visitor, 'viewer']]) {
    await pool.query(
      `INSERT INTO users (id, full_name, username, email, password_hash, role)
       VALUES ($1, $2, $2, $3, 'test', 'talent')`,
      [id, username, `${username}@example.test`],
    )
  }
  await pool.query(
    `INSERT INTO hats (id, user_id, username, hat_title, hat_name, category, role, active, feed_visible)
     VALUES ($1,$2,'creator','Videography','Video editing','Film','talent',true,true)`,
    [hatId, owner],
  )
  await pool.query(
    `INSERT INTO hat_media (hat_id, url, public_id, type)
     VALUES ($1,'https://example.test/film.jpg','cover','image')`,
    [hatId],
  )
})
after(async () => { await database?.close(); delete global.__tworldPool })

async function request(handler, url, { who = owner, method = 'GET', body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { method, url, query: {}, headers: {
    host: 'localhost',
    cookie: who ? `cw_session=${signSession({ sub: who })}` : '',
  } })
  const res = { statusCode: 200, setHeader() {}, end(value) { this.body = JSON.parse(value) } }
  await handler(req, res)
  return res
}

test('presentation whitelist refuses custom CSS, unknown accents and templates', () => {
  assert.equal(validateHatPresentation({ accent: 'electric', template: 'minimal' }), null)
  assert.equal(validateHatPresentation({ accent: '#ffffff', template: 'minimal' }) !== null, true)
  assert.equal(validateHatPresentation({ accent: 'electric', template: '<script>' }) !== null, true)
})

test('only the owner can save styles, and the saved appearance is returned everywhere', async () => {
  const endpoint = `/api/hats/${hatId}`
  const body = { action: 'set_card_style', accent: 'forest', template: 'editorial' }
  const denied = await request(hatHandler, endpoint, { who: visitor, method: 'PATCH', body })
  assert.equal(denied.statusCode, 403)
  const malformed = await request(hatHandler, endpoint, { method: 'PATCH', body: { ...body, accent: 'url(javascript:)' } })
  assert.equal(malformed.statusCode, 400)
  const saved = await request(hatHandler, endpoint, { method: 'PATCH', body })
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.hat.bento_accent, 'forest')
  assert.equal(saved.body.hat.showroom_template, 'editorial')

  const direct = await request(hatHandler, endpoint)
  assert.equal(direct.body.hat.bento_accent, 'forest')
  const feed = await request(hatsHandler, '/api/hats?feed=1&role=talent')
  assert.equal(feed.body.hats[0].bento_accent, 'forest')
  const showroom = await request(showroomHandler, '/api/showroom')
  assert.equal(showroom.body.hats[0].showroom_template, 'editorial')
})
