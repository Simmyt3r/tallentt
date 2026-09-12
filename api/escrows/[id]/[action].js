// Path: api/escrows/[id]/[action].js
import { query } from '../../_lib/db.js'
import { getSessionUser } from '../../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../../_lib/http.js'
import { verifyPaystackTransaction } from '../../_lib/paystack.js'

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

    const { rows: existingRows } = await query(
      `SELECT * FROM escrows WHERE id = $1 AND client_id = $2 AND status = 'not_funded'`,
      [id, session.sub],
    )
    const escrow = existingRows[0]
    if (!escrow) return json(res, 404, { error: 'Escrow not found or already funded' })

    // A Paystack reference can only ever fund one escrow — blocks replaying
    // the same successful transaction against a second booking.
    const { rows: dupeRows } = await query(
      `SELECT id FROM escrows WHERE payment_reference = $1`,
      [reference],
    )
    if (dupeRows[0]) return json(res, 409, { error: 'This payment reference has already been used.' })

    let txn
    try {
      txn = await verifyPaystackTransaction(reference)
    } catch (err) {
      console.error('Paystack verification failed:', err)
      return json(res, 402, { error: err.message || 'Could not verify payment.' })
    }

    if (txn.status !== 'success') {
      return json(res, 402, { error: `Payment was not successful (status: ${txn.status}).` })
    }
    if ((txn.currency || 'NGN') !== 'NGN') {
      return json(res, 402, { error: 'Unexpected payment currency.' })
    }
    // Paystack reports amount in kobo; escrows.amount is stored in naira.
    if (Math.round(txn.amount / 100) !== Number(escrow.amount)) {
      console.error(`Paystack amount mismatch: paid ${txn.amount / 100}, expected ${escrow.amount}`)
      return json(res, 402, { error: 'Paid amount does not match the escrow amount.' })
    }

    const { rows } = await query(
      `UPDATE escrows SET status = 'secured', contacts_unlocked = true,
              payment_reference = $1, funded_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reference, id],
    )
    return json(res, 200, { escrow: rows[0] })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to fund escrow' })
  }
}

async function release(req, res, id) {
  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const { rows } = await query(
      `UPDATE escrows SET status = 'released', released_at = NOW()
       WHERE id = $1 AND client_id = $2 AND status = 'secured'
       RETURNING *`,
      [id, session.sub],
    )
    if (!rows[0]) return json(res, 404, { error: 'Escrow not found or not secured' })
    return json(res, 200, { escrow: rows[0] })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: 'Failed to release escrow' })
  }
}