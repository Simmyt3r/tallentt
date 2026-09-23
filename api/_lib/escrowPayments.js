import { getClient } from './db.js'
import { notifyEscrowSecured } from './notifications.js'
import { bookingError, requireBookingId } from './bookingRules.js'
import { assertNoPendingOffer } from './bookingThreads.js'

// Callback and webhook share the same row lock as negotiation and wallet funding.
export async function applyVerifiedPayment({ escrowId, reference, txn }) {
  requireBookingId(escrowId)
  if (typeof reference !== 'string' || !reference || txn.reference !== reference) {
    throw bookingError(402, 'Payment reference does not match the verified transaction.')
  }
  if (txn.status !== 'success' || txn.currency !== 'NGN') {
    throw bookingError(402, 'A successful NGN payment is required.')
  }
  if (String(txn.metadata?.escrow_id || '') !== escrowId || txn.metadata?.wallet_topup) {
    throw bookingError(402, 'This payment reference does not belong to this booking.')
  }
  const client = await getClient()
  let result
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [escrowId])
    const escrow = rows[0]
    if (!escrow) throw bookingError(404, 'Booking not found.')
    if (escrow.payment_reference === reference && ['secured', 'released', 'refunded'].includes(escrow.status)) {
      result = { escrow, alreadyProcessed: true }
    } else {
      if (escrow.status !== 'not_funded') {
        throw bookingError(409, 'This booking cannot accept another payment. Contact support with your payment reference.')
      }
      if (!escrow.contacts_unlocked) {
        throw bookingError(409, 'The talent must accept this booking request before payment.')
      }
      // Old checkouts have a frozen price but no server-issued reference.
      if (escrow.checkout_reference && escrow.checkout_reference !== reference) {
        throw bookingError(409, 'This payment does not match the booking checkout. Contact support with your reference.')
      }
      if (!escrow.checkout_locked_at) throw bookingError(409, 'Start checkout from the current booking before paying.')
      if (!Number.isSafeInteger(txn.amount) || txn.amount < Number(escrow.amount) * 100) {
        throw bookingError(402, 'Paid amount is less than the booking amount.')
      }
      await assertNoPendingOffer(client, escrow.id)
      const { rows: walletRefs } = await client.query(`SELECT id FROM wallet_transactions WHERE reference = $1`, [reference])
      if (walletRefs[0]) throw bookingError(409, 'This payment reference is already in use.')
      const { rows: secured } = await client.query(
        `UPDATE escrows SET status = 'secured', contacts_unlocked = true,
         payment_reference = $2, funded_at = NOW() WHERE id = $1 RETURNING *`, [escrow.id, reference],
      )
      result = { escrow: secured[0], alreadyProcessed: false }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23505') throw bookingError(409, 'This payment reference is already in use.')
    throw err
  } finally {
    client.release()
  }
  if (!result.alreadyProcessed) await notifyEscrowSecured(escrowId)
  return result
}
