// Path: api/_lib/auth.js
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

const COOKIE_NAME = 'cw_session'
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7
const NIN_RE = /^\d{11}$/ // Nigerian NIN: 11 digits

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it in Vercel → Settings → Environment Variables.')
  }
  return secret
}

function getNinSecret() {
  // Deliberately separate from JWT_SECRET so rotating one doesn't silently
  // invalidate/re-derive the other. Falls back to JWT_SECRET only if unset,
  // so existing deployments don't crash — set NIN_HASH_SECRET in Vercel.
  return process.env.NIN_HASH_SECRET || getSecret()
}

// We never store a raw NIN — only a keyed hash (HMAC, not bcrypt, since we
// need the same NIN to always hash the same way for the uniqueness check
// in schema.sql). Without NIN_HASH_SECRET this can't be reversed or
// brute-forced offline the way an unsalted hash could be.
export function hashNin(nin) {
  const clean = String(nin ?? '').replace(/\D/g, '')
  if (!NIN_RE.test(clean)) {
    const err = new Error('NIN must be exactly 11 digits.')
    err.status = 400
    throw err
  }
  const digest = crypto.createHmac('sha256', getNinSecret()).update(clean).digest('hex')
  return { hash: digest, last4: clean.slice(-4) }
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function signSession(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: SEVEN_DAYS_SECONDS })
}

export function verifySession(token) {
  try {
    return jwt.verify(token, getSecret())
  } catch {
    return null
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=')
      const key = decodeURIComponent(pair.slice(0, idx).trim())
      const value = decodeURIComponent(pair.slice(idx + 1).trim())
      return [key, value]
    }),
  )
}

export function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production'
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SEVEN_DAYS_SECONDS}`,
  ]
  if (isProd) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production'
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function getSessionUser(req) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE_NAME]
  if (!token) return null
  return verifySession(token)
}

// Shape the public-safe user object returned to the frontend — never send
// password_hash or nin_hash back to the client, only whether a NIN is on
// file and its last 4 digits for display.
export function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    country: row.country,
    lga: row.lga,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    location: row.location ?? null,
    phone: row.phone ?? null,
    ninVerified: Boolean(row.nin_hash),
    ninLast4: row.nin_last4 ?? null,
    bankName: row.bank_name ?? null,
    accountNumber: row.account_number ?? null,
    accountName: row.account_name ?? null,
    // Whether Paystack has a registered Transfer Recipient for this user —
    // release() on a booking's escrow requires this to be true.
    payoutReady: Boolean(row.paystack_recipient_code),
  }
}