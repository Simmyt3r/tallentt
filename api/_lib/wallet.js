// Path: api/_lib/wallet.js
import { query, getClient } from './db.js'
import { notifyWalletTopup } from './notifications.js'

// Wallets are created lazily on first touch (INSERT ... ON CONFLICT DO
// NOTHING) rather than at registration — keeps the register action in api/auth/index.js
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
export async function creditWallet(client, { userId, amount, type, reference = null, escrowId = null, roomId = null, status = 'success' }) {
  await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2 RETURNING balance`,
    [amount, userId],
  )
  const balance = rows[0].balance
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, reference, escrow_id, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, type, amount, balance, status, reference, escrowId, roomId],
  )
  return balance
}

// Debits `userId`'s wallet — atomically refuses if the balance is
// insufficient. The `WHERE balance >= $1` makes this race-safe under
// concurrent requests: a lost race just updates 0 rows rather than
// letting the balance go negative. Throws a 402 when there isn't enough.
export async function debitWallet(client, { userId, amount, type, reference = null, escrowId = null, roomId = null, status = 'success' }) {
  await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1 RETURNING balance`,
    [amount, userId],
  )
  if (!rows[0]) {
    throw Object.assign(new Error('Insufficient wallet balance.'), { status: 402 })
  }
  const balance = rows[0].balance
  await client.query(
    `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, reference, escrow_id, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, type, amount, balance, status, reference, escrowId, roomId],
  )
  return balance
}

// ChombuTar v4 keeps wallet top-ups fee-free. Paystack may charge
// payment-rail fees externally, but the app credits the full intended
// amount and never books a platform fee as revenue.
// Applies an already-verified Paystack transaction as a wallet top-up.
// Same shape as applyVerifiedPayment() in escrowPayments.js: a reference
// can only ever be applied once — whichever of the client's callback or
// the webhook sees it first wins, the other is a no-op.
export async function applyVerifiedTopup({ userId, reference, txn }) {
  // Verified provider reference and wallet owner must match even for retries.
  // A journal row for somebody else (or for a different operation) is never
  // proof that this user's top-up has already been processed.
  if (typeof reference !== 'string' || !reference.trim() || txn?.reference !== reference) {
    throw Object.assign(new Error('Verified payment reference does not match the top-up.'), { status: 402 })
  }
  const metadataUserId = txn.metadata?.user_id ? String(txn.metadata.user_id) : null
  if (!metadataUserId || metadataUserId !== String(userId)) {
    throw Object.assign(new Error('This payment reference belongs to another wallet or has no wallet owner.'), { status: 409 })
  }

  const { rows: dupeRows } = await query(`SELECT user_id,type,status FROM wallet_transactions WHERE reference = $1`, [reference])
  if (dupeRows[0]) {
    if (String(dupeRows[0].user_id) !== String(userId) ||
      dupeRows[0].type !== 'topup' || dupeRows[0].status !== 'success') {
      throw Object.assign(new Error('This payment reference is already in use.'), { status: 409 })
    }
    return { alreadyProcessed: true, balance: await getWalletBalance(userId) }
  }

  const { rows: escrowRefRows } = await query(`SELECT id FROM escrows WHERE payment_reference = $1`, [reference])
  if (escrowRefRows[0]) {
    throw Object.assign(new Error('This payment reference is already linked to a booking.'), { status: 409 })
  }
  const isWalletTopup = txn.metadata?.wallet_topup === true || txn.metadata?.wallet_topup === 'true'
  if (!isWalletTopup) {
    throw Object.assign(new Error('This payment reference is not a wallet top-up.'), { status: 400 })
  }

  if (txn.status !== 'success') {
    throw Object.assign(new Error(`Payment was not successful (status: ${txn.status}).`), { status: 402 })
  }
  if (txn.currency !== 'NGN') {
    throw Object.assign(new Error('Unexpected payment currency.'), { status: 402 })
  }
  if (!Number.isSafeInteger(txn.amount) || txn.amount < 100) {
    throw Object.assign(new Error('Paystack returned an invalid positive kobo amount.'), { status: 402 })
  }

  // Paystack reports amount in kobo. Card payments land exactly on the
  // amount we asked for, but bank transfer and USSD checkouts gross up
  // what the customer pays to cover Paystack's own transaction fee —
  // there's no way to deduct a fee from an inbound transfer after the
  // fact, so the customer is quoted more than the requested amount
  // instead. That extra is a payment-rail cost, not ChombuTar's revenue,
  // so it's ignored below in favor of the amount the client actually
  // entered (sent to Paystack as metadata.intended_amount at checkout,
  // see payWithPaystack() in Wallet.jsx). We only require that they paid
  // at least that much — paying less throws, paying more (the Paystack
  // fee case) is simply not credited, so nobody can ever be credited
  // more than they paid.
  const paidNaira = Math.floor(txn.amount / 100)
  const rawIntent = txn.metadata?.intended_amount
  const hasIntent = rawIntent !== null && rawIntent !== undefined && rawIntent !== ''
  const requestedNaira = Number(rawIntent)
  // Never round a fractional intended amount into extra wallet credit.
  if (hasIntent && (!Number.isSafeInteger(requestedNaira) || requestedNaira < 1)) {
    throw Object.assign(new Error('Invalid requested wallet top-up amount.'), { status: 402 })
  }
  const grossAmount = hasIntent ? requestedNaira : paidNaira
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 1 || grossAmount > 2_147_483_647) {
    throw Object.assign(new Error('Invalid wallet top-up amount.'), { status: 402 })
  }

  // Compare integer kobo before converting to whole-naira wallet units.
  // For example, ₦99.50 must never satisfy an intended ₦100 top-up.
  if (txn.amount < grossAmount * 100) {
    throw Object.assign(
      new Error(
        `Payment of ₦${paidNaira.toLocaleString()} is less than the requested top-up of ₦${grossAmount.toLocaleString()}.`,
      ),
      { status: 402 },
    )
  }

  // No platform fee: credit exactly what the user intended to add.
  const amount = grossAmount
  const serviceFee = 0
  const platformFee = 0
  const vat = 0

  const client = await getClient()
  let balance
  let alreadyProcessed = false
  try {
    await client.query('BEGIN')
    balance = await creditWallet(client, { userId, amount, type: 'topup', reference })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    // Lost a race against a concurrent call with the same reference —
    // the unique index on wallet_transactions.reference caught it.
    if (err.code === '23505') {
      // Reuse this connection after ROLLBACK. Asking the pool for another
      // while still holding it can deadlock single-connection databases.
      const {rows:existing}=await client.query(
        'SELECT user_id,type,status FROM wallet_transactions WHERE reference=$1',[reference])
      if (existing.length && String(existing[0].user_id)===String(userId) &&
          existing[0].type==='topup' && existing[0].status==='success') {
        alreadyProcessed = true
      } else {
        throw Object.assign(new Error('This payment reference is already in use.'),{status:409})
      }
    } else {
      throw err
    }
  } finally {
    client.release()
  }
  if (alreadyProcessed) return { alreadyProcessed: true, balance: await getWalletBalance(userId) }
  await notifyWalletTopup({ userId, amount, balance })
  return { alreadyProcessed: false, balance, amount, serviceFee, platformFee, vat, grossAmount, paidNaira }
}
