import { randomUUID } from 'node:crypto'
import { withBooking, assertNoPendingOffer } from './bookingThreads.js'
import { bookingError, assertExpectedAmount } from './bookingRules.js'
import { debitWallet } from './wallet.js'
import { notifyEscrowSecured } from './notifications.js'

export async function prepareCheckout(userId, escrowId, expectedAmount) {
  return withBooking(userId, escrowId, async (client, escrow) => {
    if (escrow.client_id !== userId) throw bookingError(403, 'Only the client can fund this booking.')
    if (escrow.status !== 'not_funded') throw bookingError(409, 'This booking is no longer awaiting payment.')
    if (!escrow.contacts_unlocked) throw bookingError(409, 'The talent must accept this booking request before payment.')
    assertExpectedAmount(escrow, expectedAmount)
    await assertNoPendingOffer(client, escrow.id)
    const { rows } = await client.query(
      `UPDATE escrows SET checkout_locked_at = COALESCE(checkout_locked_at, NOW()),
       checkout_reference = COALESCE(checkout_reference, $2) WHERE id = $1 RETURNING *`,
      [escrow.id, `booking_${randomUUID()}`],
    )
    return { amount: rows[0].amount, reference: rows[0].checkout_reference }
  })
}

export async function payBookingWithWallet(userId, escrowId, expectedAmount) {
  const result = await withBooking(userId, escrowId, async (client, escrow) => {
    if (escrow.client_id !== userId) throw bookingError(403, 'Only the client can fund this booking.')
    if (escrow.status !== 'not_funded') throw bookingError(409, 'This booking is no longer awaiting payment.')
    if (!escrow.contacts_unlocked) throw bookingError(409, 'The talent must accept this booking request before payment.')
    assertExpectedAmount(escrow, expectedAmount)
    if (escrow.checkout_reference) {
      throw bookingError(409, 'Card checkout has already started. Complete that checkout to avoid paying twice.')
    }
    await assertNoPendingOffer(client, escrow.id)
    await debitWallet(client, { userId, amount: escrow.amount, type: 'escrow_fund', escrowId })
    const { rows } = await client.query(
      `UPDATE escrows SET status = 'secured', work_status = 'awaiting_start', contacts_unlocked = true, funded_at = NOW(),
       checkout_locked_at = COALESCE(checkout_locked_at, NOW()) WHERE id = $1 RETURNING *`, [escrow.id],
    )
    return { escrow: rows[0] }
  })
  await notifyEscrowSecured(escrowId)
  return result
}
