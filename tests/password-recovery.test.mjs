import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './database.mjs'

let db, pool, recovery, auth
const userId = randomUUID()
const messages = []
const previousFetch = globalThis.fetch
const envBackup = {}
const req = ip => ({ headers: {'x-real-ip': ip } })

before(async () => {
  db = await testDatabase()
  pool = db.pool
  global.__tworldPool = pool
  for(const key of ['RESEND_API_KEY','PASSWORD_RESET_FROM','APP_PUBLIC_URL','JWT_SECRET']) {
    envBackup[key] = process.env[key]
  }
  Object.assign(process.env,{
    RESEND_API_KEY: 'test-only', PASSWORD_RESET_FROM: 'ChombuTar <security@example.test>',
    APP_PUBLIC_URL: 'https://example.test', JWT_SECRET: 'password-recovery-test-secret'
  })
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-password-recovery-2026-10.sql',import.meta.url),'utf8'))
  auth = await import('../api/_lib/auth.js')
  recovery = await import('../api/_lib/passwordRecovery.js')
  await pool.query("INSERT INTO users(id,username,full_name,email,password_hash) VALUES($1,'recoveruser','Recover User','recover@example.test',$2)",
    [userId, await auth.hashPassword('OriginalSecurePassword123')])
  globalThis.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body))
    return { ok: true, status: 200 }
  }
})
after(async () => {
  globalThis.fetch = previousFetch
  for(const [key,value] of Object.entries(envBackup)) {
    if(value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await db?.close()
  delete global.__tworldPool
})

test('password recovery does not disclose whether an email is registered', async () => {
  const known = await recovery.requestPasswordReset(req('203.0.113.1'), 'recover@example.test')
  const unknown = await recovery.requestPasswordReset(req('203.0.113.2'), 'nobody@example.test')
  assert.deepEqual(known, unknown)
  assert.equal(messages.length, 1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM password_reset_tokens')).rows[0].n,1)
})

test('reset links are high-entropy, one-time and do not expose raw tokens in the database', async () => {
  const body = messages[0].text
  const match = body.match(/reset=([a-f0-9]{64})/)
  assert.ok(match, 'email must contain a complete recovery link')
  const token = match[1]
  const { rows } = await pool.query('SELECT token_hash,expires_at FROM password_reset_tokens WHERE user_id=$1',[userId])
  assert.equal(rows.length,1)
  assert.notEqual(rows[0].token_hash,token)
  assert.ok(new Date(rows[0].expires_at) > new Date())
  await assert.rejects(recovery.completePasswordReset(token,'short'),{status:400})
  const result = await recovery.completePasswordReset(token,'ReplacementSecurePassword456')
  assert.match(result.message,/updated/i)
  await assert.rejects(recovery.completePasswordReset(token,'ThirdSecurePassword789'),{status:400})
  const updated = (await pool.query('SELECT password_hash FROM users WHERE id=$1',[userId])).rows[0]
  assert.equal(await auth.verifyPassword('OriginalSecurePassword123',updated.password_hash),false)
  assert.equal(await auth.verifyPassword('ReplacementSecurePassword456',updated.password_hash),true)
})

test('expired links are rejected without changing the password', async () => {
  await recovery.requestPasswordReset(req('203.0.113.3'),'recover@example.test')
  const match=messages.at(-1).text.match(/reset=([a-f0-9]{64})/)
  assert.ok(match)
  await pool.query('UPDATE password_reset_tokens SET expires_at=NOW()-INTERVAL \'1 second\' WHERE user_id=$1',[userId])
  await assert.rejects(recovery.completePasswordReset(match[1],'AnotherSecurePassword789'),{status:400})
  const row=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[userId])).rows[0]
  assert.equal(await auth.verifyPassword('ReplacementSecurePassword456',row.password_hash),true)
})

test('request rate limit is enforced across registered and unknown email addresses', async () => {
  const beforeCount=messages.length
  for(let i=0;i<10;i++) {
    const response=await recovery.requestPasswordReset(req('203.0.113.5'),'nobody@example.test')
    assert.match(response.message,/If this address belongs/i)
  }
  const {rows}=await pool.query(`SELECT COUNT(*)::int AS n FROM password_reset_attempts
    WHERE ip_hash=(SELECT ip_hash FROM password_reset_attempts GROUP BY ip_hash ORDER BY COUNT(*) DESC LIMIT 1)`)
  assert.equal(rows[0].n,8)
  assert.equal(messages.length,beforeCount)
})
