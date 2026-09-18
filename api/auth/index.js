// Path: api/auth/index.js
// Consolidates what used to be six separate files — login.js, logout.js,
// me.js, register.js, username-check.js, profile.js — into one function.
// Vercel Hobby caps a deployment at 12 serverless functions; this project
// was already sitting at exactly 12 before Combutar Live added a 13th
// (api/live/index.js). Folding these six into one, same dispatch-by-action
// pattern as api/escrows/index.js and api/admin/index.js, drops the total
// back down with real headroom instead of just barely re-fitting.
import { query, getClient } from '../_lib/db.js'
import {
  verifyPassword,
  hashPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  hashNin,
  toPublicUser,
} from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import { listBanks, resolveBankAccount, createTransferRecipient } from '../_lib/paystack.js'
import { getNotificationInbox, markAllNotificationsRead, markNotificationRead } from '../_lib/notifications.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/
const VALID_ROLES = ['talent', 'client', 'dual']
// One shared list — used to be duplicated between register.js,
// username-check.js, and profile.js. Now there's only one copy to keep in sync.
const RESERVED_USERNAMES = new Set(['admin', 'talent', 'test', 'chombutar', 'talentworld', 'tworld', 'support', 'root'])
const MAX_BIO = 280

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'me'
    if (action === 'me') return handleMe(req, res)
    if (action === 'username-check') return handleUsernameCheck(url, res)
    if (action === 'banks') return handleBanks(res)
    if (action === 'resolve-account') return handleResolveAccount(url, res)
    if (action === 'notifications') return handleNotifications(req, res)
    return json(res, 400, { error: 'Unknown action.' })
  }

  if (req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch {
      return json(res, 400, { error: 'Invalid request body' })
    }
    if (body?.action === 'login') return handleLogin(body, res)
    if (body?.action === 'register') return handleRegister(body, res)
    if (body?.action === 'logout') return handleLogout(res)
    return json(res, 400, { error: 'Unknown action.' })
  }

  if (req.method === 'PUT') return handleProfileUpdate(req, res)

  return methodNotAllowed(res, ['GET', 'POST', 'PUT'])
}

// ---------------------------------------------------------------------------
// GET ?action=me
// ---------------------------------------------------------------------------
async function handleMe(req, res) {
  const session = getSessionUser(req)
  if (!session) return json(res, 401, { error: 'Not signed in' })

  try {
    const result = await query(
      `SELECT id, full_name, username, email, role, is_admin, country, lga,
              avatar_url, bio, location, phone, nin_hash, nin_last4,
              bank_name, account_number, account_name, paystack_recipient_code,
              (SELECT balance FROM wallets WHERE wallets.user_id = users.id) as wallet_balance
       FROM users WHERE id = $1`,
      [session.sub],
    )
    const row = result.rows[0]
    if (!row) return json(res, 401, { error: 'Not signed in' })
    return json(res, 200, { user: toPublicUser(row) })
  } catch (err) {
    console.error('me error:', err)
    return json(res, 500, { error: 'Something went wrong.' })
  }
}

// ---------------------------------------------------------------------------
// GET ?action=username-check&u=...
// ---------------------------------------------------------------------------
async function handleUsernameCheck(url, res) {
  try {
    const raw = (url.searchParams.get('u') || '').trim().replace(/^@/, '')
    if (!raw) return json(res, 400, { status: 'invalid', message: 'Username required' })

    if (!USERNAME_RE.test(raw)) {
      return json(res, 200, { status: 'invalid', message: '3–30 chars: letters, numbers, . _ -' })
    }
    if (RESERVED_USERNAMES.has(raw.toLowerCase())) {
      return json(res, 200, { status: 'taken', message: 'Reserved username' })
    }

    const { rows } = await query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`, [raw])
    if (rows.length) return json(res, 200, { status: 'taken', message: 'Taken' })
    return json(res, 200, { status: 'available', message: 'Available' })
  } catch (err) {
    console.error(err)
    return json(res, 500, { status: 'error', message: 'Check failed' })
  }
}

// ---------------------------------------------------------------------------
// POST { action: 'login', email, password }
// ---------------------------------------------------------------------------
async function handleLogin(body, res) {
  const { email, password } = body ?? {}
  if (!email || !password) return json(res, 400, { error: 'Enter your email and password.' })

  // Same generic error for "no such user" and "wrong password" so we don't
  // leak which emails have accounts.
  const invalidCreds = () =>
    json(res, 401, {
      error: 'We could not find an account with those details. Create an account to get started.',
    })

  try {
    const result = await query(
      `SELECT id, full_name, username, email, password_hash, role, is_admin, country, lga,
              bank_name, account_number, account_name, paystack_recipient_code,
              (SELECT balance FROM wallets WHERE wallets.user_id = users.id) as wallet_balance
       FROM users WHERE email = $1`,
      [String(email).trim().toLowerCase()],
    )
    const row = result.rows[0]
    if (!row) return invalidCreds()

    const ok = await verifyPassword(password, row.password_hash)
    if (!ok) return invalidCreds()

    const user = toPublicUser(row)
    const token = signSession({ sub: user.id })
    setSessionCookie(res, token)
    return json(res, 200, { user })
  } catch (err) {
    console.error('login error:', err)
    return json(res, 500, { error: 'Something went wrong signing you in. Try again.' })
  }
}

// ---------------------------------------------------------------------------
// POST { action: 'logout' }
// ---------------------------------------------------------------------------
async function handleLogout(res) {
  clearSessionCookie(res)
  return json(res, 200, { ok: true })
}

// ---------------------------------------------------------------------------
// POST { action: 'register', fullName, username, email, password, country, lga, role }
// ---------------------------------------------------------------------------
async function handleRegister(body, res) {
  const { fullName, username, email, password, country, lga, role } = body ?? {}

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return json(res, 400, { error: 'Enter your full name.' })
  }
  const cleanUsername = String(username ?? '').trim().replace(/^@/, '')
  if (!USERNAME_RE.test(cleanUsername)) {
    return json(res, 400, { error: 'Username must be 3-30 characters: letters, numbers, dots, dashes, underscores.' })
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return json(res, 400, { error: 'Enter a valid email address.' })
  }
  if (!password || String(password).length < 8) {
    return json(res, 400, { error: 'Password must be at least 8 characters.' })
  }
  if (!VALID_ROLES.includes(role)) {
    return json(res, 400, { error: 'Choose a valid role.' })
  }
  if (!country || !lga) {
    return json(res, 400, { error: 'Country and city/LGA are required.' })
  }

  try {
    const passwordHash = await hashPassword(password)
    const result = await query(
      `INSERT INTO users (full_name, username, email, password_hash, role, country, lga)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, username, email, role, is_admin, country, lga`,
      [fullName.trim(), cleanUsername, String(email).trim().toLowerCase(), passwordHash, role, country, lga.trim()],
    )

    const user = toPublicUser(result.rows[0])
    const token = signSession({ sub: user.id })
    setSessionCookie(res, token)
    return json(res, 201, { user })
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('username') ? 'Username' : 'Email'
      return json(res, 409, { error: `${field} is already taken.` })
    }
    console.error('register error:', err)
    return json(res, 500, { error: 'Something went wrong creating your account. Try again.' })
  }
}

// ---------------------------------------------------------------------------
// GET ?action=banks / ?action=resolve-account / ?action=notifications
// (unchanged from what api/auth/profile.js already folded these into)
// ---------------------------------------------------------------------------
async function handleBanks(res) {
  try {
    const banks = await listBanks()
    return json(res, 200, { banks: banks.map((b) => ({ name: b.name, code: b.code })) })
  } catch (err) {
    return json(res, 502, { error: err.message })
  }
}

async function handleResolveAccount(url, res) {
  const accountNumber = url.searchParams.get('account_number')
  const bankCode = url.searchParams.get('bank_code')
  if (!accountNumber || !bankCode) return json(res, 400, { error: 'account_number and bank_code are required.' })
  try {
    const account = await resolveBankAccount(accountNumber, bankCode)
    return json(res, 200, { accountName: account.account_name })
  } catch (err) {
    return json(res, 400, { error: err.message })
  }
}

async function handleNotifications(req, res) {
  const session = getSessionUser(req)
  if (!session?.sub) return json(res, 401, { error: 'Not signed in' })
  try {
    return json(res, 200, await getNotificationInbox(session.sub))
  } catch (err) {
    console.error('notification inbox error:', err)
    return json(res, 500, { error: 'Failed to load notifications.' })
  }
}

// ---------------------------------------------------------------------------
// PUT — profile update, plus the two notification-mutation sub-actions
// api/auth/profile.js already folded in here.
// ---------------------------------------------------------------------------
async function handleProfileUpdate(req, res) {
  const session = getSessionUser(req)
  if (!session?.sub) return json(res, 401, { error: 'Not signed in' })

  let body
  try {
    body = await readBody(req)
  } catch {
    return json(res, 400, { error: 'Invalid request body' })
  }

  if (body?.action === 'mark_notification_read') {
    const notificationId = String(body.notificationId || '').trim()
    if (!notificationId) return json(res, 400, { error: 'notificationId is required.' })
    try {
      const notification = await markNotificationRead(session.sub, notificationId)
      if (!notification) return json(res, 404, { error: 'Notification not found.' })
      const inbox = await getNotificationInbox(session.sub)
      return json(res, 200, { notification, unreadCount: inbox.unreadCount })
    } catch (err) {
      console.error('notification read update error:', err)
      return json(res, 500, { error: 'Failed to update notification.' })
    }
  }

  if (body?.action === 'mark_all_notifications_read') {
    try {
      const updated = await markAllNotificationsRead(session.sub)
      return json(res, 200, { updated, unreadCount: 0 })
    } catch (err) {
      console.error('notification bulk read update error:', err)
      return json(res, 500, { error: 'Failed to update notifications.' })
    }
  }

  const { fullName, username, bio, location, phone, country, lga, avatarUrl, nin, bankCode, bankName, accountNumber } =
    body ?? {}

  // Payout details are optional per-request, same pattern as NIN below —
  // only touched when the talent actually submits bank info. The account
  // holder name is always re-resolved from Paystack here rather than
  // trusted from the client, since it's what a payout will actually go to.
  let cleanBankCode = null
  let cleanBankName = null
  let cleanAccountNumber = null
  let cleanAccountName = null
  let recipientCode = null
  if (bankCode != null && accountNumber != null) {
    cleanAccountNumber = String(accountNumber).trim()
    if (!/^\d{10}$/.test(cleanAccountNumber)) {
      return json(res, 400, { error: 'Account number must be exactly 10 digits.' })
    }
    cleanBankCode = String(bankCode).trim()
    cleanBankName = bankName ? String(bankName).trim() : null

    try {
      const resolved = await resolveBankAccount(cleanAccountNumber, cleanBankCode)
      cleanAccountName = resolved.account_name
      const recipient = await createTransferRecipient({
        name: cleanAccountName,
        accountNumber: cleanAccountNumber,
        bankCode: cleanBankCode,
      })
      recipientCode = recipient.recipient_code
    } catch (err) {
      return json(res, 400, { error: err.message })
    }
  }

  if (fullName != null && (typeof fullName !== 'string' || fullName.trim().length < 2)) {
    return json(res, 400, { error: 'Full name must be at least 2 characters.' })
  }

  let cleanUsername = null
  if (username != null) {
    cleanUsername = String(username).trim().replace(/^@/, '')
    if (!USERNAME_RE.test(cleanUsername)) {
      return json(res, 400, { error: 'Username must be 3-30 characters: letters, numbers, dots, dashes, underscores.' })
    }
    if (RESERVED_USERNAMES.has(cleanUsername.toLowerCase())) {
      return json(res, 400, { error: 'That username is reserved.' })
    }
  }

  if (bio != null && String(bio).length > MAX_BIO) {
    return json(res, 400, { error: `Bio must be ${MAX_BIO} characters or fewer.` })
  }
  if (avatarUrl != null && typeof avatarUrl !== 'string') {
    return json(res, 400, { error: 'Invalid avatar.' })
  }

  // NIN is optional per-request — only touched when the user actually
  // types a new one. The raw value is hashed here and never persisted or
  // logged in plaintext.
  let ninHash = null
  let ninLast4 = null
  if (nin != null && String(nin).trim() !== '') {
    try {
      const result = hashNin(nin)
      ninHash = result.hash
      ninLast4 = result.last4
    } catch (err) {
      return json(res, err.status || 400, { error: err.message })
    }
  }

  // Username lives on the user row, but hats keep a denormalized copy for
  // fast listing queries (see api/hats/index.js). When the username
  // changes, both need to move together, so this runs as a transaction —
  // a client is checked out just for this request rather than using the
  // shared single-connection pool.
  const client = await getClient()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE users SET
         full_name  = COALESCE($1, full_name),
         username   = COALESCE($2, username),
         bio        = COALESCE($3, bio),
         location   = COALESCE($4, location),
         phone      = COALESCE($5, phone),
         country    = COALESCE($6, country),
         lga        = COALESCE($7, lga),
         avatar_url = COALESCE($8, avatar_url),
         nin_hash   = COALESCE($9, nin_hash),
         nin_last4  = COALESCE($10, nin_last4),
         bank_code  = COALESCE($11, bank_code),
         bank_name  = COALESCE($12, bank_name),
         account_number = COALESCE($13, account_number),
         account_name   = COALESCE($14, account_name),
         paystack_recipient_code = COALESCE($15, paystack_recipient_code)
       WHERE id = $16
       RETURNING id, full_name, username, email, role, is_admin, country, lga,
                 avatar_url, bio, location, phone, nin_hash, nin_last4,
                 bank_name, account_number, account_name, paystack_recipient_code,
                 (SELECT balance FROM wallets WHERE wallets.user_id = users.id) as wallet_balance`,
      [
        fullName?.trim() ?? null,
        cleanUsername,
        bio ?? null,
        location ?? null,
        phone ?? null,
        country ?? null,
        lga ?? null,
        avatarUrl ?? null,
        ninHash,
        ninLast4,
        cleanBankCode,
        cleanBankName,
        cleanAccountNumber,
        cleanAccountName,
        recipientCode,
        session.sub,
      ],
    )
    const row = result.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return json(res, 404, { error: 'User not found' })
    }

    if (cleanUsername) {
      await client.query(`UPDATE hats SET username = $1 WHERE user_id = $2`, [cleanUsername, session.sub])
    }

    await client.query('COMMIT')
    return json(res, 200, { user: toPublicUser(row) })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23505' && err.constraint?.includes('nin')) {
      return json(res, 409, { error: 'This NIN is already linked to another account.' })
    }
    if (err.code === '23505' && err.constraint?.includes('username')) {
      return json(res, 409, { error: 'That username is already taken.' })
    }
    console.error('profile update error:', err)
    return json(res, 500, { error: 'Something went wrong updating your profile.' })
  } finally {
    client.release()
  }
}
