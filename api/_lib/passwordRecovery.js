import { randomBytes, createHash } from 'node:crypto'
import { query, getClient } from './db.js'
import { hashPassword } from './auth.js'

const emailPattern = /^[^ @]+@[^ @]+[.][^ @]+$/
const digest = text => createHash('sha256').update(text).digest('hex')
const generic = { message: 'If this address belongs to an account, you will receive a recovery email shortly.' }
const failure = (status, message) => Object.assign(new Error(message), { status })

function configuration() {
  const base = process.env.APP_PUBLIC_URL || process.env.VITE_APP_URL
  const key = process.env.RESEND_API_KEY
  const from = process.env.PASSWORD_RESET_FROM
  let url
  try { url = new URL(base) } catch {}
  if (!key || !from || !url || url.protocol !== 'https:' || !url.hostname)
    throw failure(503, 'Password recovery is not configured. An administrator must configure email delivery and the public application URL.')
  return { base: url.origin, key, from }
}

function ipFingerprint(req) {
  // Prefer reverse-proxy-provided address. Never persist plaintext IP data.
  const ip = String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').slice(0, 128)
  return digest((process.env.JWT_SECRET || 'missing-secret') + ':' + ip)
}

export async function requestPasswordReset(req, email) {
  const cfg = configuration()
  const normalized = String(email || '').trim().toLowerCase()
  if (!emailPattern.test(normalized) || normalized.length > 254 || [...normalized].some(char => char.charCodeAt(0) <= 32))
    throw failure(400, 'Enter a valid email address.')
  const ipHash = ipFingerprint(req)
  // Query-and-insert in a single statement. Limit email requests even when
  // the address does not exist; responses never disclose registered accounts.
  const { rows: attempts } = await query(`WITH allowance AS (
    SELECT COUNT(*)::int AS count FROM password_reset_attempts
    WHERE ip_hash=$1 AND created_at > NOW()-INTERVAL '1 hour'
  ), inserted AS (
    INSERT INTO password_reset_attempts(ip_hash)
    SELECT $1 FROM allowance WHERE count < 8 RETURNING id
  ) SELECT id FROM inserted`, [ipHash])
  if (!attempts.length) return generic

  const { rows } = await query('SELECT id FROM users WHERE LOWER(email)=$1 LIMIT 1', [normalized])
  if (!rows.length) return generic
  const userId = rows[0].id
  const { rows: recent } = await query(`SELECT COUNT(*)::int AS count FROM password_reset_tokens
    WHERE user_id=$1 AND created_at > NOW()-INTERVAL '1 hour'`, [userId])
  if (recent[0].count >= 3) return generic

  const token = randomBytes(32).toString('hex')
  const tokenHash = digest(token)
  await query(`INSERT INTO password_reset_tokens(token_hash,user_id,expires_at)
    VALUES ($1,$2,NOW()+INTERVAL '30 minutes')`, [tokenHash,userId])
  const link = cfg.base + '/auth?reset=' + encodeURIComponent(token)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: cfg.from, to: [normalized], subject: 'Reset your ChombuTar password',
        text: 'A password reset was requested for your ChombuTar account.\n\nUse this single-use link within 30 minutes:\n' + link +
          '\n\nIf you did not request this, ignore this message. Never share this link.',
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('Email provider returned ' + response.status)
  } catch (error) {
    console.error('Password recovery email failed:', error.message)
    await query('DELETE FROM password_reset_tokens WHERE token_hash=$1', [tokenHash]).catch(() => {})
    // Generic response prevents user enumeration on delivery failure.
  }
  return generic
}

export async function completePasswordReset(token, password) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token))
    throw failure(400, 'This reset link is invalid or expired.')
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    throw failure(400, 'Choose a new password between 8 and 72 characters.')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT user_id FROM password_reset_tokens
      WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`, [digest(token)])
    if (!rows.length) throw failure(400, 'This reset link is invalid or expired.')
    const userId = rows[0].user_id
    const passwordHash = await hashPassword(password)
    await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash,userId])
    // Consume every outstanding reset link for the user, not just the clicked one.
    await client.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId])
    await client.query('COMMIT')
    return { message: 'Password updated. Sign in using your new password.' }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}
