// Path: api/_lib/escrowPayments.js
import { query } from './db.js'

// Applies an already-verified Paystack transaction to a not_funded escrow.
// Called from two places that can race each other for the same payment:
// the client's success callback (api/escrows/[id]/[action].js's fund())
// and Paystack's webhook (api/escrows/index.js). Whichever gets here
// first wins; the other sees alreadyProcessed: true and does nothing
// further — nobody gets double-charged or double-secured.
export async function applyVerifiedPayment({ escrowId, reference, txn }) {
  // A reference can only ever belong to one escrow. If it's already
  // attached to *this* escrow, the other path already handled it — no-op.
  // If it's attached to a *different* escrow, something is wrong (reused
  // or forged reference) and we refuse rather than silently ignore it.
  const { rows: dupeRows } = await query(`SELECT * FROM escrows WHERE payment_reference = $1`, [reference])
  const dupe = dupeRows[0]
  if (dupe) {
    if (dupe.id === escrowId) return { escrow: dupe, alreadyProcessed: true }
    throw Object.assign(new Error('This payment reference is already linked to a different booking.'), {
      status: 409,
    })
  }

  const { rows: walletRefRows } = await query(`SELECT id FROM wallet_transactions WHERE reference = $1`, [reference])
  if (walletRefRows[0]) {
    throw Object.assign(new Error('This payment reference is already linked to a wallet top-up.'), { status: 409 })
  }
  const metadataEscrowId = txn.metadata?.escrow_id ? String(txn.metadata.escrow_id) : null
  if (metadataEscrowId && metadataEscrowId !== String(escrowId)) {
    throw Object.assign(new Error('This payment reference belongs to another booking.'), { status: 409 })
  }

  const { rows: existingRows } = await query(`SELECT * FROM escrows WHERE id = $1 AND status = 'not_funded'`, [
    escrowId,
  ])
  const escrow = existingRows[0]
  if (!escrow) {
    // Either the id doesn't exist, or the escrow moved past 'not_funded'
    // between when the caller looked it up and now (the other path beat
    // us to it). Return current state instead of erroring — the payment
    // itself isn't in question, just who gets to record it.
    const { rows: currentRows } = await query(`SELECT * FROM escrows WHERE id = $1`, [escrowId])
    return { escrow: currentRows[0] || null, alreadyProcessed: true }
  }

  if (txn.status !== 'success') {
    throw Object.assign(new Error(`Payment was not successful (status: ${txn.status}).`), { status: 402 })
  }
  if ((txn.currency || 'NGN') !== 'NGN') {
    throw Object.assign(new Error('Unexpected payment currency.'), { status: 402 })
  }
  // Paystack reports amount in kobo; escrows.amount is stored in naira.
  // Card payments land exactly on escrow.amount, but bank transfer and
  // USSD checkouts gross up what the customer pays to cover Paystack's
  // own fee (same reasoning as applyVerifiedTopup in wallet.js) — so a
  // transfer payer can legitimately pay a little *more*. Only reject if
  // they paid less; the escrow itself is always secured for its own
  // fixed amount, never the inflated one.
  if (Math.round(txn.amount / 100) < Number(escrow.amount)) {
    throw Object.assign(new Error('Paid amount does not match the escrow amount.'), { status: 402 })
  }

  const { rows } = await query(
    `UPDATE escrows SET status = 'secured', contacts_unlocked = true,
            payment_reference = $1, funded_at = NOW()
     WHERE id = $2 AND status = 'not_funded' RETURNING *`,
    [reference, escrowId],
  )
  if (!rows[0]) {
    // Lost a race between our SELECT above and this UPDATE.
    const { rows: currentRows } = await query(`SELECT * FROM escrows WHERE id = $1`, [escrowId])
    return { escrow: currentRows[0] || null, alreadyProcessed: true }
  }
  return { escrow: rows[0], alreadyProcessed: false }
}