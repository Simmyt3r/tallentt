import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'
import { buildPayload, emptyForm, hydrateForm } from '../src/lib/hatForm.js'

// The Create/Edit Hat form now sends `hat_title` (the Hat's name) and `seeking`
// (what it is for) separately; these check the API stores, returns, suggests
// from and searches them that way — and keeps older Hats working.
const database = await testDatabase()
global.__tworldPool = database.pool
process.env.JWT_SECRET = 'hat-seeking-test-secret'
const { pool } = database
after(() => database.close())

const ids = {
  client: '22222222-2222-4222-8222-222222222222',
  talent: '11111111-1111-4111-8111-111111111111',
  legacy: '66666666-6666-4666-8666-666666666666',
}
const { signSession } = await import('../api/_lib/auth.js')

async function call(modulePath, { method = 'GET', url, who, body, query = {} }) {
  const handler = (await import(modulePath)).default
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Object.assign(Readable.from(payload), {
    method,
    url,
    query,
    headers: { host: 'localhost', cookie: who ? `cw_session=${signSession({ sub: ids[who] })}` : '' },
  })
  const res = { statusCode: 200, setHeader() {}, end(text) { this.body = text } }
  await handler(req, res)
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null }
}
const createHat = (who, over, role) => {
  const form = { ...emptyForm({}), category: 'Film', deliveryMode: 'Remote', amount: '30000', ...over }
  return call('../api/hats/index.js', { method: 'POST', url: '/api/hats', who, body: buildPayload(form, { mode: 'create', role }) })
}

before(async () => {
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  await pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash, role, company_suffix)
    VALUES ($1, 'Simeon Laboratories', 'silabs', 'c@example.test', '08022222222', 'x', 'client', 'Ltd.')`, [ids.client])
  await pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash, role)
    VALUES ($1, 'Sarverun Simeon Tertese', 'simeon', 't@example.test', '08011111111', 'x', 'talent')`, [ids.talent])
})

test('creating a Hat stores its title and what it is seeking separately', async () => {
  const { status, body } = await createHat('client', { title: 'Q3 shoot crew', seeking: 'Wedding photographer' }, 'client')
  assert.equal(status, 201, JSON.stringify(body))
  assert.equal(body.hat.hat_title, 'Q3 shoot crew')
  assert.equal(body.hat.seeking, 'Wedding photographer')
  assert.equal(body.hat.username, 'silabs') // the stored username is untouched
})

test('an older app that only sends hat_title still creates a Hat (seeking = title)', async () => {
  const payload = buildPayload({ ...emptyForm({}), title: 'Sound engineer', seeking: 'ignored', category: 'Music', deliveryMode: 'Remote', amount: '10000' }, { mode: 'create', role: 'client' })
  delete payload.seeking
  const { status, body } = await call('../api/hats/index.js', { method: 'POST', url: '/api/hats', who: 'client', body: payload })
  assert.equal(status, 201, JSON.stringify(body))
  assert.equal(body.hat.hat_title, 'Sound engineer')
  assert.equal(body.hat.seeking, 'Sound engineer')
})

test('over-long seeking is rejected with a clear message', async () => {
  const { status, body } = await createHat('client', { title: 'Fine', seeking: 'x'.repeat(81) }, 'client')
  assert.equal(status, 400)
  assert.match(body.error, /Seeking must be 80 characters or fewer/)
})

test('editing either value leaves the other alone', async () => {
  const created = (await createHat('client', { title: 'Edit me', seeking: 'Colourist' }, 'client')).body.hat
  const detail = async () => (await call('../api/hats/[id].js', { url: `/api/hats/${created.id}`, who: 'client', query: { id: created.id } })).body.hat
  const edit = async (over) => {
    const form = { ...hydrateForm(await detail()), ...over }
    const res = await call('../api/hats/[id].js', {
      method: 'PUT', url: `/api/hats/${created.id}`, who: 'client', query: { id: created.id },
      body: buildPayload(form, { mode: 'edit', role: 'client' }),
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return detail()
  }

  const renamed = await edit({ title: 'Renamed' })
  assert.deepEqual([renamed.hat_title, renamed.seeking], ['Renamed', 'Colourist'])

  const reworded = await edit({ seeking: 'Video editor' })
  assert.deepEqual([reworded.hat_title, reworded.seeking], ['Renamed', 'Video editor'])

  const bad = await call('../api/hats/[id].js', { method: 'PUT', url: `/api/hats/${created.id}`, who: 'client', query: { id: created.id }, body: { ...buildPayload(hydrateForm(reworded), { mode: 'edit', role: 'client' }), seeking: '   ' } })
  assert.equal(bad.status, 400)
})

test('the detail view carries seeking for the modal', async () => {
  const hat = (await pool.query(`SELECT id FROM hats WHERE hat_title = 'Q3 shoot crew'`)).rows[0]
  const { body: card } = await call('../api/hats/[id].js', { url: `/api/hats/${hat.id}?include=owner`, who: 'talent', query: { id: hat.id } })
  assert.equal(card.title, 'Q3 shoot crew')
  assert.equal(card.seeking, 'Wedding photographer')

  // A Hat that predates the split has no seeking of its own: the title stands in.
  await pool.query(`INSERT INTO hats (id, user_id, hat_title, username, category, rate, role, active)
    VALUES ($1, $2, 'Old style', 'simeon', 'Film', 100, 'talent', true)`, ['77777777-7777-4777-8777-777777777777', ids.talent])
  const { body: old } = await call('../api/hats/[id].js', { url: '/api/hats/77777777-7777-4777-8777-777777777777?include=owner', who: 'client', query: { id: '77777777-7777-4777-8777-777777777777' } })
  assert.equal(old.seeking, 'Old style')
})

test('the Seeking typeahead draws on what the other side is seeking, not on Hat names', async () => {
  const suggest = async (q) =>
    (await call('../api/hats/index.js', { url: `/api/hats?suggest=1&role=talent&q=${q}`, who: 'talent' })).body.suggestions
  assert.ok((await suggest('Wedd')).includes('Wedding photographer'))
  assert.ok(!(await suggest('Q3')).includes('Q3 shoot crew'))

  // A Hat that predates the split has no seeking of its own: its title is used.
  await pool.query(`INSERT INTO hats (id, user_id, hat_title, username, category, rate, role, active)
    VALUES ($1, $2, 'Legacy gig', 'silabs', 'Film', 100, 'client', true)`, [ids.legacy, ids.client])
  assert.ok((await suggest('Legacy')).includes('Legacy gig'))
})

test('search matches what a Hat is seeking as well as its title', async () => {
  const search = async (term) =>
    (await call('../api/hats/index.js', { url: `/api/hats?role=client&search=${term}`, who: 'talent' })).body.hats.map((h) => h.hat_title)
  assert.ok((await search('Wedding')).includes('Q3 shoot crew')) // matched on seeking
  assert.ok((await search('shoot')).includes('Q3 shoot crew')) // matched on title
})

test('profile chips carry both, so "Hiring" can show what is wanted', async () => {
  const { body } = await call('../api/users/[username].js', { url: '/api/users/silabs', query: { username: 'silabs' } })
  const chip = body.hats.client.find((h) => h.hat_title === 'Q3 shoot crew')
  assert.equal(chip.seeking, 'Wedding photographer')
  const legacy = body.hats.client.find((h) => h.hat_title === 'Legacy gig')
  assert.equal(legacy.seeking, 'Legacy gig')
})
