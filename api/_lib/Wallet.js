// Path: api/_lib/wallet.js
import { query, getClient } from './db.js'

// Wallets are created lazily on first touch (INSERT ... ON CONFLICT DO
// NOTHING) rather than at registration — keeps api/auth/register.js
// untouched, and every call site below already owns its own client.
export async function getWalletBalance(userId) {
  await query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId])
  return rows[0]?.balance ?? 0
}

// Credits `userId`'s wallet and logs it in wallet_transactions. Always
// called with a `client` already inside a BEGIN/COMMIT — the two things
// that credit a wallet (a verified top-up, an escrow release paying out
// to the talent) both need the balance update and the ledger row to
// commit or roll back together.
export async function creditWallet(client, { userId, amount, type, reference = null, escrowId = null, status = 'success' }) {
  await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2 RETURNING balance`,
    [amount, userId],
  )
  const balance = rows[0].balance
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, reference, escrow_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, amount, balance, status, reference, escrowId],
  )
  return balance
}

// Debits `userId`'s wallet — atomically refuses if the balance is
// insufficient. The `WHERE balance >= $1` makes this race-safe under
// concurrent requests: a lost race just updates 0 rows rather than
// letting the balance go negative. Throws a 402 when there isn't enough.
export async function debitWallet(client, { userId, amount, type, reference = null, escrowId = null, status = 'success' }) {
  await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance - $1 WHERE user_id = $2 AND balance >= $1 RETURNING balance`,
    [amount, userId],
  )
  if (!rows[0]) {
    throw Object.assign(new Error('Insufficient wallet balance.'), { status: 402 })
  }
  const balance = rows[0].balance
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, reference, escrow_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, amount, balance, status, reference, escrowId],
  )
  return balance
}

// Applies an already-verified Paystack transaction as a wallet top-up.
// Same shape as applyVerifiedPayment() in escrowPayments.js: a reference
// can only ever be applied once — whichever of the client's callback or
// the webhook sees it first wins, the other is a no-op.
export async function applyVerifiedTopup({ userId, reference, txn }) {
  const { rows: dupeRows } = await query(`SELECT id FROM wallet_transactions WHERE reference = $1`, [reference])
  if (dupeRows[0]) {
    return { alreadyProcessed: true, balance: await getWalletBalance(userId) }
  }

  if (txn.status !== 'success') {
    throw Object.assign(new Error(`Payment was not successful (status: ${txn.status}).`), { status: 402 })
  }
  if ((txn.currency || 'NGN') !== 'NGN') {
    throw Object.assign(new Error('Unexpected payment currency.'), { status: 402 })
  }
  const amount = Math.round(txn.amount / 100) // Paystack reports kobo; wallets.balance is naira.

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const balance = await creditWallet(client, { userId, amount, type: 'topup', reference })
    await client.query('COMMIT')
    return { alreadyProcessed: false, balance, amount }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    // Lost a race against a concurrent call with the same reference —
    // the unique index on wallet_transactions.reference caught it.
    if (err.code === '23505') {
      return { alreadyProcessed: true, balance: await getWalletBalance(userId) }
    }
    throw err
  } finally {
    client.release()
  }
}