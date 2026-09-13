// Path: api/auth/me.js
import { query } from '../_lib/db.js'
import { getSessionUser, toPublicUser } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSessionUser(req)
  if (!session) return res.status(401).json({ error: 'Not signed in' })

  try {
    const result = await query(
      `SELECT id, full_name, username, email, role, country, lga,
              avatar_url, bio, location, phone, nin_hash, nin_last4,
              bank_name, account_number, account_name, paystack_recipient_code
       FROM users WHERE id = $1`,
      [session.sub],
    )
    const row = result.rows[0]
    if (!row) return res.status(401).json({ error: 'Not signed in' })
    return res.status(200).json({ user: toPublicUser(row) })
  } catch (err) {
    console.error('me error:', err)
    return res.status(500).json({ error: 'Something went wrong.' })
  }
}