// Path: api/escrows/index.js
import { query } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody, readRawBody } from '../_lib/http.js'
import { verifyPaystackWebhookSignature, verifyPaystackTransaction } from '../_lib/paystack.js'
import { applyVerifiedPayment } from '../_lib/escrowPayments.js'

export default async function handler(req, res) {
  // GET /api/escrows?mine=1 — "My Bookings": escrows the signed-in user
  // created as a client, joined with the hat + its owner. Folded into
  // this same function (Vercel Hobby's 12-function cap) rather than a
  // dedicated /api/bookings endpoint.
  if (req.method === 'GET') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.searchParams.get('mine') !== '1') {
        return methodNotAllowed(res, ['POST'])
      }

      const { rows } = await query(
        `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, e.status,
                e.contacts_unlocked, e.created_at, e.released_at,
                e.payout_status,
                h.hat_title, h.category, h.role as hat_role, h.currency,
                u.id as talent_user_id, u.username as talent_username,
                u.full_name as talent_full_name, u.avatar_url as talent_avatar,
                (SELECT m.url FROM hat_media m WHERE m.hat_id = h.id ORDER BY m.created_at LIMIT 1) as hat_thumbnail
         FROM escrows e
         JOIN hats h ON h.id = e.hat_id
         LEFT JOIN users u ON u.id = e.talent_id
         WHERE e.client_id = $1
         ORDER BY e.created_at DESC`,
        [session.sub],
      )
      return json(res, 200, { bookings: rows })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: 'Failed to fetch bookings' })
    }
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  // Paystack webhook — point Paystack's dashboard at this same URL
  // (https://chombutar.vercel.app/api/escrows). Distinguished from the
  // app's own "create escrow" POST purely by the signature header, which
  // only Paystack sends. Folded in here rather than a dedicated
  // /api/webhooks/paystack endpoint (Vercel Hobby's 12-function cap).
  const signature = req.headers['x-paystack-signature']
  if (signature) {
    return handlePaystackWebhook(req, res, signature)
  }

  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const body = await readBody(req)
    const { hat_id, talent_id } = body
    if (!hat_id) return json(res, 400, { error: 'hat_id required' })

    const { rows: hatRows } = await query(
      `SELECT id, user_id, price_type, rate, price_min FROM hats WHERE id = $1`,
      [hat_id],
    )
    if (!hatRows[0]) return json(res, 404, { error: 'Hat not found' })
    const hat = hatRows[0]
    // Fixed pricing escrows the flat rate; range pricing escrows the floor
    // of the range (the client can always fund more once agreed).
    const amount = hat.price_type === 'range' ? hat.price_min : hat.rate
    if (!amount) return json(res, 400, { error: 'This hat has no price set yet.' })
    const talent = talent_id || hat.user_id

    const { rows } = await query(
      `INSERT INTO escrows (hat_id, client_id, talent_id, amount, status, contacts_unlocked)
       VALUES ($1, $2, $3, $4, 'not_funded', false) RETURNING *`,
      [hat_id, session.sub, talent, amount],
    )
    return json(res, 201, { escrow: rows[0] })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: err.message || 'Failed to create escrow' })
  }
}

// Handles Paystack's charge.success event as a fallback to the client-side
// callback in payWithPaystack() — if the user closes the tab right after
// paying, this is what still confirms the payment and secures the escrow.
// Shares applyVerifiedPayment() with fund() (api/escrows/[id]/[action].js)
// so a payment only ever gets applied once, whichever path sees it first.
async function handlePaystackWebhook(req, res, signature) {
  const rawBody = await readRawBody(req)

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    console.error('Paystack webhook: signature mismatch — rejecting')
    return json(res, 401, { error: 'Invalid signature' })
  }

  let event
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return json(res, 400, { error: 'Invalid payload' })
  }

  // Acknowledge everything we don't act on with 200 — Paystack retries
  // non-2xx responses, and neither "wrong event type" nor a downstream
  // business-logic mismatch is something a retry would fix.
  if (event?.event !== 'charge.success') {
    return json(res, 200, { received: true })
  }

  const data = event.data || {}
  const escrowId = data.metadata?.escrow_id
  if (!escrowId) {
    console.error('Paystack webhook: charge.success with no escrow_id in metadata, reference:', data.reference)
    return json(res, 200, { received: true })
  }

  try {
    // Re-verify against Paystack's API rather than trusting the webhook
    // payload's amount/status directly — belt-and-suspenders even though
    // the signature already authenticates the sender.
    const txn = await verifyPaystackTransaction(data.reference)
    await applyVerifiedPayment({ escrowId, reference: data.reference, txn })
  } catch (err) {
    // Logged for manual reconciliation, not retried — a payload that
    // fails validation now (amount mismatch, wrong currency, etc.) will
    // fail identically on every retry.
    console.error('Paystack webhook: failed to apply payment', { escrowId, reference: data.reference }, err)
  }
  return json(res, 200, { received: true })
}