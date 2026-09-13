// Path: api/escrows/[id]/[action].js
import { query } from '../../_lib/db.js'
import { getSessionUser } from '../../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../../_lib/http.js'
import { verifyPaystackTransaction, initiateTransfer } from '../../_lib/paystack.js'
import { applyVerifiedPayment } from '../../_lib/escrowPayments.js'

// Handles both:
//   POST /api/escrows/:id/fund
//   POST /api/escrows/:id/release
// Merged into one function (via the [action] dynamic segment) to stay
// under Vercel's serverless function limit. Same behavior as the
// original fund.js / release.js files, just dispatched by req.query.action.
export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const id = req.query?.id
  const action = req.query?.action
  if (!id) return json(res, 400, { error: 'Missing id' })

  if (action === 'fund') return fund(req, res, id)
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

async function release(req, res, id) {
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const { rows: existingRows } = await query(
      `SELECT e.*, u.paystack_recipient_code
       FROM escrows e
       JOIN users u ON u.id = e.talent_id
       WHERE e.id = $1 AND e.client_id = $2 AND e.status = 'secured'`,
      [id, session.sub],
    )
    const escrow = existingRows[0]
    if (!escrow) return json(res, 404, { error: 'Escrow not found or not secured' })

    if (!escrow.paystack_recipient_code) {
      return json(res, 409, {
        error: "This talent hasn't added their payout bank details yet — ask them to add it in their profile, then try releasing again.",
      })
    }

    const reference = `payout_${escrow.id}_${Date.now()}`
    let transfer
    try {
      transfer = await initiateTransfer({
        amountNaira: escrow.amount,
        recipientCode: escrow.paystack_recipient_code,
        reference,
        reason: 'Tallentt booking payout',
      })
    } catch (err) {
      console.error('Paystack transfer failed:', err)
      return json(res, 502, { error: err.message || 'Could not initiate the payout. Please try again.' })
    }

    // 'success' means Paystack completed the transfer immediately — only
    // happens when OTP is disabled for API transfers on the business
    // account (Dashboard → Settings → Preferences). Any other status
    // ('otp', 'pending') means it needs manual finalization in the
    // Paystack dashboard before the talent actually receives the money.
    const payoutStatus = transfer.status === 'success' ? 'success' : 'pending'

    const { rows } = await query(
      `UPDATE escrows SET status = 'released', released_at = NOW(),
              payout_reference = $1, payout_status = $2,
              paid_out_at = CASE WHEN $2 = 'success' THEN NOW() ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [reference, payoutStatus, id],
    )
    return json(res, 200, { escrow: rows[0], payoutStatus })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to release escrow' })
  }
}