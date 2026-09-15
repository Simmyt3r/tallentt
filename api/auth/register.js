import { query } from '../_lib/db.js'
import { hashPassword, signSession, setSessionCookie, toPublicUser } from '../_lib/auth.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/
const VALID_ROLES = ['talent', 'client', 'dual']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { fullName, username, email, password, country, lga, role } = req.body ?? {}

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Enter your full name.' })
  }
  const cleanUsername = String(username ?? '').trim().replace(/^@/, '')
  if (!USERNAME_RE.test(cleanUsername)) {
    return res
      .status(400)
      .json({ error: 'Username must be 3-30 characters: letters, numbers, dots, dashes, underscores.' })
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Choose a valid role.' })
  }
  if (!country || !lga) {
    return res.status(400).json({ error: 'Country and city/LGA are required.' })
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
    return res.status(201).json({ user })
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('username') ? 'Username' : 'Email'
      return res.status(409).json({ error: `${field} is already taken.` })
    }
    console.error('register error:', err)
    return res.status(500).json({ error: 'Something went wrong creating your account. Try again.' })
  }
}