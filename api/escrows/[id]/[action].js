// Path: api/escrows/[id]/[action].js
import { query } from '../../_lib/db.js'
import { getSessionUser } from '../../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../../_lib/http.js'
import { verifyPaystackTransaction } from '../../_lib/paystack.js'
import { applyVerifiedPayment } from '../../_lib/escrowPayments.js'
import { bookingLifecycle } from '../../_lib/bookingLifecycle.js'
import { prepareCheckout, payBookingWithWallet } from '../../_lib/bookingCheckout.js'
import { issueBookingQr, redeemBookingQr } from '../../_lib/bookingQr.js'

// Handles:
//   POST /api/escrows/:id/fund         — pay with card (Paystack)
//   POST /api/escrows/:id/fund-wallet  — pay from wallet balance
//   POST /api/escrows/:id/release      — compatibility alias for approve_delivery
//   POST /api/escrows/:id/{submit_delivery,request_revision,approve_delivery,open_dispute}
// Merged into one function (via the [action] dynamic segment) to stay
// under Vercel's serverless function limit.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const id = req.query?.id
  const action = req.query?.action
  if (!id) return json(res, 400, { error: 'Missing id' })

  if (action === 'prepare-checkout' || action === 'fund-wallet') {
    res.setHeader('Cache-Control', 'private, no-store')
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })
      const body = await readBody(req)
      const operation = action === 'prepare-checkout' ? prepareCheckout : payBookingWithWallet
      return json(res, 200, await operation(session.sub, id, body?.expected_amount))
    } catch (err) {
      if (!err.status) console.error('Booking checkout failed:', err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Could not fund this booking.' })
    }
  }

  if (action === 'fund') return fund(req, res, id)
  if (action === 'generate-qr' || action === 'redeem-qr') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })
      const body = await readBody(req)
      return json(res, 200, action === 'generate-qr'
        ? await issueBookingQr(session.sub, id, body?.stage)
        : await redeemBookingQr(session.sub, id, body?.token))
    } catch (err) {
      if (!err.status) console.error('Booking QR checkpoint failed:', err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Could not process the QR checkpoint.' })
    }
  }
  if (['submit_delivery', 'request_revision', 'open_dispute', 'approve_delivery', 'release'].includes(action)) {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })
      const body = await readBody(req)
      // Old PWA clients must refresh; they cannot bypass delivery or a dispute.
      return json(res, 200, await bookingLifecycle(session.sub, id, action === 'release' ? 'approve_delivery' : action, body))
    } catch (err) {
      if (!err.status) console.error('Booking update failed:', err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Could not update this booking.' })
    }
  }
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
