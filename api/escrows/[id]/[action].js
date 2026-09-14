// Path: api/escrows/[id]/[action].js
import { query, getClient } from '../../_lib/db.js'
import { getSessionUser } from '../../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../../_lib/http.js'
import { verifyPaystackTransaction } from '../../_lib/paystack.js'
import { applyVerifiedPayment } from '../../_lib/escrowPayments.js'
import { debitWallet, creditWallet } from '../../_lib/wallet.js'

// Handles:
//   POST /api/escrows/:id/fund         — pay with card (Paystack)
//   POST /api/escrows/:id/fund-wallet  — pay from wallet balance
//   POST /api/escrows/:id/release      — move funds into the talent's wallet
// Merged into one function (via the [action] dynamic segment) to stay
// under Vercel's serverless function limit.
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const id = req.query?.id
  const action = req.query?.action
  if (!id) return json(res, 400, { error: 'Missing id' })

  if (action === 'fund') return fund(req, res, id)
  if (action === 'fund-wallet') return fundWithWallet(req, res, id)
  if (action === 'release') return release(req, res, id)
  return json(res, 404, { error: 'Unknown escrow action' })
}

async function fund(req, res, id) {
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const body = await readBody(req)
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
    if (!reference) return json(res, 400, { error: 'Payment reference is required.' })

    const { rows: ownedRows } = await query(`SELECT id FROM escrows WHERE id = $1 AND client_id = $2`, [
      id,
      session.sub,
    ])
    if (!ownedRows[0]) return json(res, 404, { error: 'Escrow not found.' })

    let txn
    try {
      txn = await verifyPaystackTransaction(reference)
    } catch (err) {
      console.error('Paystack verification failed:', err)
      return json(res, 402, { error: err.message || 'Could not verify payment.' })
    }

    // Shared with the Paystack webhook (api/escrows/index.js) — whichever
    // of the two notices this payment first wins; if the webhook already
    // beat this request to it (e.g. the user closed the tab right after
    // paying and this callback is only firing now on a retry), this just
    // returns the already-secured escrow instead of erroring.
    try {
      const { escrow } = await applyVerifiedPayment({ escrowId: id, reference, txn })
      return json(res, 200, { escrow })
    } catch (err) {
      return json(res, err.status || 402, { error: err.message })
    }
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to fund escrow' })
  }
}

// Pays for a booking straight out of the client's wallet balance instead
// of a Paystack popup — pure DB transaction, no external call, no
// verification step needed since the money already sits in the wallet.
async function fundWithWallet(req, res, id) {
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const { rows: ownedRows } = await query(
      `SELECT * FROM escrows WHERE id = $1 AND client_id = $2 AND status = 'not_funded'`,
      [id, session.sub],
    )
    const escrow = ownedRows[0]
    if (!escrow) return json(res, 404, { error: 'Escrow not found or already funded.' })

    const client = await getClient()
    try {
      await client.query('BEGIN')
      await debitWallet(client, {
        userId: session.sub,
        amount: escrow.amount,
        type: 'escrow_fund',
        escrowId: escrow.id,
      })
      const { rows } = await client.query(
        `UPDATE escrows SET status = 'secured', contacts_unlocked = true
         WHERE id = $1 AND status = 'not_funded' RETURNING *`,
        [id],
      )
      if (!rows[0]) {
        await client.query('ROLLBACK')
        return json(res, 409, { error: 'This booking was already funded.' })
      }
      await client.query('COMMIT')
      return json(res, 200, { escrow: rows[0] })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error(err)
    return json(res, err.status || 500, { error: err.message || 'Failed to fund escrow from wallet' })
  }
}

// Moves a secured escrow's funds into the talent's wallet balance. This
// used to call Paystack's Transfer API directly (requiring the talent to
// have payout bank details on file *before* a client could ever release
// a booking, and leaving payouts stuck in an 'otp'/'pending' limbo when
// OTP was enabled). Now release just credits the wallet — instant, no
// bank details required yet — and the talent withdraws to their bank
// whenever they want (POST /api/escrows { action: 'withdraw' }), which is
// where that OTP caveat now lives instead.
async function release(req, res, id) {
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const { rows: existingRows } = await query(
      `SELECT * FROM escrows WHERE id = $1 AND client_id = $2 AND status = 'secured'`,
      [id, session.sub],
    )
    const escrow = existingRows[0]
    if (!escrow) return json(res, 404, { error: 'Escrow not found or not secured' })

    const client = await getClient()
    try {
      await client.query('BEGIN')
      await creditWallet(client, {
        userId: escrow.talent_id,
        amount: escrow.amount,
        type: 'escrow_release',
        escrowId: escrow.id,
      })
      const { rows } = await client.query(
        `UPDATE escrows SET status = 'released', released_at = NOW()
         WHERE id = $1 AND status = 'secured' RETURNING *`,
        [id],
      )
      if (!rows[0]) {
        await client.query('ROLLBACK')
        return json(res, 409, { error: 'This booking was already released.' })
      }
      await client.query('COMMIT')
      return json(res, 200, { escrow: rows[0] })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to release escrow' })
  }
}