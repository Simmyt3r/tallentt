// Path: api/escrows/index.js
import { query, getClient } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody, readRawBody } from '../_lib/http.js'
import { verifyPaystackWebhookSignature, verifyPaystackTransaction, initiateTransfer } from '../_lib/paystack.js'
import { applyVerifiedPayment } from '../_lib/escrowPayments.js'
import { getWalletBalance, creditWallet, debitWallet, applyVerifiedTopup } from '../_lib/wallet.js'

export default async function handler(req, res) {
  // GET /api/escrows?mine=1 — "My Bookings" (escrows created as a client).
  // GET /api/escrows?wallet=1 — wallet balance + transaction history.
  // Both folded into this same function (Vercel Hobby's 12-function cap)
  // rather than dedicated /api/bookings or /api/wallet endpoints.
  if (req.method === 'GET') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      const url = new URL(req.url, `http://${req.headers.host}`)

      if (url.searchParams.get('wallet') === '1') {
        const balance = await getWalletBalance(session.sub)
        const { rows: transactions } = await query(
          `SELECT id, type, amount, balance_after, status, reference, escrow_id, created_at
           FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [session.sub],
        )
        return json(res, 200, { wallet: { balance, transactions } })
      }

      if (url.searchParams.get('mine') !== '1') {
        return methodNotAllowed(res, ['POST'])
      }

      const { rows } = await query(
        `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, e.status,
                e.contacts_unlocked, e.created_at, e.released_at,
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
  // app's own POSTs purely by the signature header, which only Paystack
  // sends. Folded in here rather than a dedicated /api/webhooks/paystack
  // endpoint (Vercel Hobby's 12-function cap).
  const signature = req.headers['x-paystack-signature']
  if (signature) {
    return handlePaystackWebhook(req, res, signature)
  }

  try {
    const session = getSessionUser(req)
    if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

    const body = await readBody(req)

    // Wallet actions — dispatched by body.action, same pattern as the
    // fund/release split in api/escrows/[id]/[action].js, kept in this
    // file rather than a dedicated /api/wallet endpoint for the same
    // function-cap reason as the webhook above.
    if (body.action === 'topup') return handleTopup(res, session, body)
    if (body.action === 'withdraw') return handleWithdraw(res, session, body)

    const { hat_id } = body
    if (!hat_id) return json(res, 400, { error: 'hat_id required' })

    const { rows: hatRows } = await query(
      `SELECT id, user_id, role, active, price_type, rate, price_min FROM hats WHERE id = $1`,
      [hat_id],
    )
    if (!hatRows[0]) return json(res, 404, { error: 'Hat not found' })
    const hat = hatRows[0]
    if (!hat.active) return json(res, 400, { error: 'This hat is no longer active.' })
    if (hat.role !== 'talent') {
      return json(res, 400, { error: 'Client hats accept applications. Only talent hats can be booked.' })
    }
    if (hat.user_id === session.sub) {
      return json(res, 400, { error: "You can't book your own hat." })
    }

    // Fixed pricing escrows the flat rate; range pricing escrows the floor
    // of the range. The payee is always the hat owner, never client input.
    const amount = Number(hat.price_type === 'range' ? hat.price_min : hat.rate)
    if (!Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: 'This hat has no price set yet.' })
    }

    const { rows: existingRows } = await query(
      `SELECT * FROM escrows
       WHERE hat_id = $1 AND client_id = $2 AND status IN ('not_funded','secured')
       ORDER BY created_at DESC LIMIT 1`,
      [hat_id, session.sub],
    )
    if (existingRows[0]) {
      return json(res, 200, { escrow: existingRows[0], already_exists: true })
    }

    const { rows } = await query(
      `INSERT INTO escrows (hat_id, client_id, talent_id, amount, status, contacts_unlocked)
       VALUES ($1, $2, $3, $4, 'not_funded', false) RETURNING *`,
      [hat_id, session.sub, hat.user_id, amount],
    )
    return json(res, 201, { escrow: rows[0] })
  } catch (err) {
    console.error(err)
    return json(res, 500, { error: err.message || 'Failed to create escrow' })
  }
}

// POST /api/escrows { action: 'topup', reference } — client already ran
// the Paystack popup (see payWithPaystack in src/lib/api.js) and is
// handing us the resulting reference to verify and credit.
async function handleTopup(res, session, body) {
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  if (!reference) return json(res, 400, { error: 'Payment reference is required.' })

  let txn
  try {
    txn = await verifyPaystackTransaction(reference)
  } catch (err) {
    console.error('Paystack verification failed (topup):', err)
    return json(res, 402, { error: err.message || 'Could not verify payment.' })
  }

  try {
    const { balance, amount, alreadyProcessed, serviceFee = 0, platformFee = 0, vat = 0, grossAmount } = await applyVerifiedTopup({
      userId: session.sub,
      reference,
      txn,
    })
    return json(res, 200, { balance, amount, alreadyProcessed, serviceFee, platformFee, vat, grossAmount })
  } catch (err) {
    return json(res, err.status || 402, { error: err.message })
  }
}

// POST /api/escrows { action: 'withdraw', amount } — moves money out of
// the wallet to the talent's bank account. Debits the wallet first, in
// its own committed transaction, then calls Paystack; if the transfer
// call itself fails, the debit is refunded rather than left in limbo.
async function handleWithdraw(res, session, body) {
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(res, 400, { error: 'Enter a valid amount to withdraw.' })
  }

  const { rows: userRows } = await query(`SELECT paystack_recipient_code FROM users WHERE id = $1`, [session.sub])
  const recipientCode = userRows[0]?.paystack_recipient_code
  if (!recipientCode) {
    return json(res, 409, { error: 'Add your payout bank account in your profile before withdrawing.' })
  }

  const reference = `withdrawal_${session.sub}_${Date.now()}`

  const client = await getClient()
  try {
    await client.query('BEGIN')
    await debitWallet(client, { userId: session.sub, amount, type: 'withdrawal', reference, status: 'pending' })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return json(res, err.status || 500, { error: err.message || 'Could not start withdrawal.' })
  } finally {
    client.release()
  }

  let transfer
  try {
    transfer = await initiateTransfer({
      amountNaira: amount,
      recipientCode,
      reference,
      reason: 'ChombuTar wallet withdrawal',
    })
  } catch (err) {
    console.error('Wallet withdrawal transfer failed:', err)
    await refundFailedWithdrawal(session.sub, reference, amount)
    return json(res, 502, {
      error: `${err.message || 'Could not initiate the withdrawal.'} Your balance has been refunded.`,
    })
  }

  // Same OTP caveat as the old escrow release used to have: 'success'
  // only happens with OTP disabled for API transfers on the Paystack
  // business account. Anything else needs manual finalization in the
  // Paystack dashboard before the talent actually receives the money.
  const payoutStatus = transfer.status === 'success' ? 'success' : 'pending'
  await query(`UPDATE wallet_transactions SET status = $1 WHERE reference = $2`, [payoutStatus, reference])
  const balance = await getWalletBalance(session.sub)
  return json(res, 200, { balance, payoutStatus })
}

async function refundFailedWithdrawal(userId, reference, amount) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await creditWallet(client, { userId, amount, type: 'refund', reference: `${reference}_refund` })
    await client.query(`UPDATE wallet_transactions SET status = 'failed' WHERE reference = $1`, [reference])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    // If even the refund fails, the debit above already committed — the
    // money isn't lost, just stuck. Needs manual reconciliation.
    console.error('Wallet withdrawal refund failed — needs manual reconciliation:', { userId, reference, amount }, err)
  } finally {
    client.release()
  }
}

// Handles Paystack's charge.success event as a fallback to the
// client-side callback — for escrow funding (see payWithPaystack() in
// api.js and fund() in api/escrows/[id]/[action].js) and for wallet
// top-ups (handleTopup above). Whichever path sees a given reference
// first wins; the other is a no-op (see applyVerifiedPayment /
// applyVerifiedTopup).
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
  const isWalletTopup = data.metadata?.wallet_topup === true
  const walletUserId = data.metadata?.user_id

  if (!escrowId && !(isWalletTopup && walletUserId)) {
    console.error('Paystack webhook: charge.success with no escrow_id/wallet metadata, reference:', data.reference)
    return json(res, 200, { received: true })
  }

  try {
    // Re-verify against Paystack's API rather than trusting the webhook
    // payload's amount/status directly — belt-and-suspenders even though
    // the signature already authenticates the sender.
    const txn = await verifyPaystackTransaction(data.reference)
    if (isWalletTopup) {
      await applyVerifiedTopup({ userId: walletUserId, reference: data.reference, txn })
    } else {
      await applyVerifiedPayment({ escrowId, reference: data.reference, txn })
    }
  } catch (err) {
    // Logged for manual reconciliation, not retried — a payload that
    // fails validation now (amount mismatch, wrong currency, etc.) will
    // fail identically on every retry.
    console.error('Paystack webhook: failed to apply payment', { escrowId, walletUserId, reference: data.reference }, err)
  }
  return json(res, 200, { received: true })
}