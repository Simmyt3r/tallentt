// Path: api/auth/profile.js
import { getClient } from '../_lib/db.js'
import { getSessionUser, hashNin, toPublicUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import { listBanks, resolveBankAccount, createTransferRecipient } from '../_lib/paystack.js'

const MAX_BIO = 280
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/
// Kept in sync with api/auth/username-check.js's RESERVED set.
const RESERVED_USERNAMES = new Set([
  'admin', 'talent', 'test', 'chombutar', 'talentworld', 'tworld', 'support', 'root',
])

export default async function handler(req, res) {
  // GET /api/auth/profile?action=banks — bank picker for the payout form.
  // GET /api/auth/profile?action=resolve-account&account_number=&bank_code=
  //   — confirms an account before it's saved. Folded into this same
  //   function (Vercel Hobby's 12-function cap) rather than dedicated
  //   /api/banks or /api/payouts endpoints.
  if (req.method === 'GET') {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Not signed in' })

    const url = new URL(req.url, `http://${req.headers.host}`)
    const action = url.searchParams.get('action')

    if (action === 'banks') {
      try {
        const banks = await listBanks()
        return json(res, 200, { banks: banks.map((b) => ({ name: b.name, code: b.code })) })
      } catch (err) {
        return json(res, 502, { error: err.message })
      }
    }

    if (action === 'resolve-account') {
      const accountNumber = url.searchParams.get('account_number')
      const bankCode = url.searchParams.get('bank_code')
      if (!accountNumber || !bankCode) {
        return json(res, 400, { error: 'account_number and bank_code are required.' })
      }
      try {
        const account = await resolveBankAccount(accountNumber, bankCode)
        return json(res, 200, { accountName: account.account_name })
      } catch (err) {
        return json(res, 400, { error: err.message })
      }
    }

    return json(res, 400, { error: 'Unknown action.' })
  }

  if (req.method !== 'PUT') return methodNotAllowed(res, ['GET', 'PUT'])

  const session = getSessionUser(req)
  if (!session?.sub) return json(res, 401, { error: 'Not signed in' })

  let body
  try {
    body = await readBody(req)
  } catch {
    return json(res, 400, { error: 'Invalid request body' })
  }

  const { fullName, username, bio, location, phone, country, lga, avatarUrl, nin, bankCode, bankName, accountNumber } =
    body ?? {}

  // Payout details are optional per-request, same pattern as NIN above —
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
      return json(res, 400, {
        error: 'Username must be 3-30 characters: letters, numbers, dots, dashes, underscores.',
      })
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
       RETURNING id, full_name, username, email, role, country, lga,
                 avatar_url, bio, location, phone, nin_hash, nin_last4,
                 bank_name, account_number, account_name, paystack_recipient_code`,
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