// Local-only fixture server for reviewing the real UI against isolated test data.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

const database = await testDatabase()
global.__tworldPool = database.pool
process.env.JWT_SECRET = 'local-preview-only-secret'
await database.pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
const ids = { client: '11111111-1111-4111-8111-111111111111', talent: '22222222-2222-4222-8222-222222222222',
  hat: '33333333-3333-4333-8333-333333333333', escrow: '44444444-4444-4444-8444-444444444444',
  refund: '55555555-5555-4555-8555-555555555555', admin: '66666666-6666-4666-8666-666666666666' }
for (const role of ['client', 'talent', 'admin']) {
  await database.pool.query(`INSERT INTO users (id, full_name, username, email, phone, password_hash, is_admin)
    VALUES ($1, $2, $2, $3, '08012345678', 'local-test-only', $4)`,
  [ids[role], role === 'client' ? 'studio_client' : role === 'talent' ? 'amara_edits' : 'case_reviewer', `${role}@example.test`, role !== 'talent'])
}
await database.pool.query(`INSERT INTO hats (id, user_id, hat_title, username, category, rate, price_negotiable)
  VALUES ($1, $2, 'Event video editing', 'amara_edits', 'Film', 10000, true)`, [ids.hat, ids.talent])
await database.pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount) VALUES ($1, $2, $3, $4, 10000)`,
  [ids.escrow, ids.hat, ids.client, ids.talent])
await database.pool.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 50000)`, [ids.client])
await database.pool.query(`INSERT INTO escrows (id, hat_id, client_id, talent_id, amount) VALUES ($1, $2, $3, $4, 10000)`,
  [ids.refund, ids.hat, ids.client, ids.talent])
const { payBookingWithWallet } = await import('../api/_lib/bookingCheckout.js')
await payBookingWithWallet(ids.client, ids.refund, 10000)
const { threadAction } = await import('../api/_lib/bookingThreads.js')
await threadAction(ids.client, { action: 'send_message', escrow_id: ids.escrow, body: 'I need a two-minute highlight reel for our event. Can you deliver by Friday?', client_token: ids.client })
await threadAction(ids.talent, { action: 'send_message', escrow_id: ids.escrow, body: 'Yes. The edit includes colour correction, music and one revision.', client_token: ids.talent })
await threadAction(ids.talent, { action: 'make_offer', escrow_id: ids.escrow, body: 'For the highlight reel and one revision.', amount: 9000, expected_offer_id: null, client_token: ids.hat })
const escrowHandler = (await import('../api/escrows/index.js')).default
const actionHandler = (await import('../api/escrows/[id]/[action].js')).default
const meHandler = (await import('../api/auth/index.js')).default
const profileHandler = (await import('../api/auth/profile.js')).default
const adminHandler = (await import('../api/admin/index.js')).default
const { signSession } = await import('../api/_lib/auth.js')
const server = http.createServer(async (req, res) => {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
  try {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/api/__test/session') {
      const role = ['client', 'talent', 'admin'].includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'client'
      res.setHeader('Set-Cookie', `cw_session=${signSession({ sub: ids[role] })}; Path=/; HttpOnly; SameSite=Lax`)
      res.writeHead(302, { Location: role === 'admin' ? '/admin?tab=disputes' : `/messages?escrow=${ids.escrow}` }); res.end(); return
    }
    req.query = Object.fromEntries(url.searchParams)
    if (url.pathname === '/api/auth/me') return await meHandler(req, res)
    if (url.pathname === '/api/auth/profile') return await profileHandler(req, res)
    if (url.pathname === '/api/admin') return await adminHandler(req, res)
    if (url.pathname === '/api/escrows') return await escrowHandler(req, res)
    const action = url.pathname.match(/^\/api\/escrows\/([^/]+)\/([^/]+)$/)
    if (action) { req.query = { id: action[1], action: action[2] }; return await actionHandler(req, res) }
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Not in the local fixture"}')
  } catch (err) { console.error(err); res.writeHead(500); res.end('{}') }
})
server.listen(3000, '127.0.0.1', () => console.log('Local fixture API ready on http://127.0.0.1:3000'))
export async function closePreview() {
  await new Promise((resolve) => server.close(resolve))
  await database.close()
}
async function stop() { await closePreview(); process.exit(0) }
process.once('SIGTERM', stop); process.once('SIGINT', stop)
