// Path: api/auth/login.js
import { query } from '../_lib/db.js'
import { verifyPassword, signSession, setSessionCookie, toPublicUser } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' })
  }

  // Same generic error for "no such user" and "wrong password" so we don't
  // leak which emails have accounts.
  const invalidCreds = () =>
    res.status(401).json({
      error: 'We could not find an account with those details. Create an account to get started.',
    })

  try {
    const result = await query(
      `SELECT id, full_name, username, email, password_hash, role, country, lga,
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
    return res.status(200).json({ user })
  } catch (err) {
    console.error('login error:', err)
    return res.status(500).json({ error: 'Something went wrong signing you in. Try again.' })
  }
}