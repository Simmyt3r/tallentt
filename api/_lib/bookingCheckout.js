import { randomUUID } from 'node:crypto'
import { getClient } from './db.js'
import { withBooking, assertNoPendingOffer } from './bookingThreads.js'
import { bookingError, assertExpectedAmount } from './bookingRules.js'
import { creditWallet, debitWallet } from './wallet.js'
import { notifyEscrowSecured } from './notifications.js'

// Legacy compatibility only. Fresh clients no longer call this because every
// in-platform payment is funded from the ChombuTar wallet. Keeping the
// endpoint briefly prevents an already-cached PWA from stranding a Paystack
// payment that was started before the wallet-only rollout.
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
    await assertNoPendingOffer(client, escrow.id)

    await debitWallet(client, {
      userId,
      amount: escrow.amount,
      type: 'escrow_fund',
      reference: `escrow:${escrow.id}:wallet-fund`,
      escrowId,
    })

    const { rows } = await client.query(
      `UPDATE escrows
       SET status = 'secured',
           work_status = 'awaiting_start',
           contacts_unlocked = true,
           funded_at = NOW(),
           checkout_locked_at = COALESCE(checkout_locked_at, NOW()),
           checkout_reference = NULL
       WHERE id = $1
       RETURNING *`,
      [escrow.id],
    )
    return { escrow: rows[0] }
  })
  await notifyEscrowSecured(escrowId)
  return result
}

// Compatibility bridge for Paystack charges initiated by an old cached client.
// Even these legacy charges now enter the wallet ledger first, then fund the
// escrow from the wallet in the same database transaction. New clients never
// expose this route: Paystack is wallet-top-up only.
export async function applyVerifiedLegacyBookingCharge({ escrowId, reference, txn, userId = null }) {
  const cleanReference = String(reference || '').trim()
  if (!cleanReference) throw bookingError(400, 'Payment reference is required.')

  const client = await getClient()
  let result
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `SELECT * FROM escrows WHERE id = $1 FOR UPDATE`,
      [escrowId],
    )
    const escrow = rows[0]
    if (!escrow) throw bookingError(404, 'Escrow not found.')
    if (userId && escrow.client_id !== userId) throw bookingError(403, 'Only the client can fund this booking.')

    if (
      escrow.payment_reference === cleanReference &&
      ['secured', 'released', 'refunded'].includes(escrow.status)
    ) {
      result = { escrow, alreadyProcessed: true }
      await client.query('COMMIT')
      return result
    }

    if (escrow.status !== 'not_funded') {
      throw bookingError(409, 'This booking is no longer awaiting payment.')
    }
    if (!escrow.contacts_unlocked) {
      throw bookingError(409, 'The talent must accept this booking request before payment.')
    }
    if (escrow.checkout_reference && escrow.checkout_reference !== cleanReference) {
      throw bookingError(409, 'This payment does not match the booking checkout.')
    }

    const metadataEscrowId = txn?.metadata?.escrow_id ? String(txn.metadata.escrow_id) : null
    if (metadataEscrowId && metadataEscrowId !== String(escrow.id)) {
      throw bookingError(409, 'This payment belongs to another booking.')
    }
    if (txn?.status !== 'success') {
      throw bookingError(402, `Payment was not successful (status: ${txn?.status || 'unknown'}).`)
    }
    if ((txn?.currency || 'NGN') !== 'NGN') {
      throw bookingError(402, 'Unexpected payment currency.')
    }
    if (!Number.isSafeInteger(txn?.amount) || txn.amount <= 0) {
      throw bookingError(402, 'Invalid payment amount.')
    }

    const paidNaira = Math.floor(txn.amount / 100)
    if (paidNaira < Number(escrow.amount)) {
      throw bookingError(402, 'Paid amount is less than the booking amount.')
    }

    await assertNoPendingOffer(client, escrow.id)

    const topupReference = `paystack:${cleanReference}`
    const { rows: existingTopup } = await client.query(
      `SELECT id, user_id FROM wallet_transactions WHERE reference = $1`,
      [topupReference],
    )
    if (existingTopup[0]) {
      if (String(existingTopup[0].user_id) !== String(escrow.client_id)) {
        throw bookingError(409, 'This payment reference is already in use.')
      }
    } else {
      await creditWallet(client, {
        userId: escrow.client_id,
        amount: paidNaira,
        type: 'topup',
        reference: topupReference,
      })
    }

    await debitWallet(client, {
      userId: escrow.client_id,
      amount: escrow.amount,
      type: 'escrow_fund',
      reference: `escrow:${escrow.id}:legacy-paystack:${cleanReference}`,
      escrowId: escrow.id,
    })

    const { rows: secured } = await client.query(
      `UPDATE escrows
       SET status = 'secured',
           work_status = 'awaiting_start',
           contacts_unlocked = true,
           payment_reference = $2,
           funded_at = NOW(),
           checkout_reference = NULL
       WHERE id = $1
       RETURNING *`,
      [escrow.id, cleanReference],
    )
    result = { escrow: secured[0], alreadyProcessed: false }
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
