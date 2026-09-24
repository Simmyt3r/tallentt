import { randomUUID } from 'node:crypto'
// Path: api/escrows/index.js
import { query, getClient } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody, readRawBody } from '../_lib/http.js'
import { verifyPaystackWebhookSignature, verifyPaystackTransaction, initiateTransfer } from '../_lib/paystack.js'
import { applyVerifiedPayment } from '../_lib/escrowPayments.js'
import { getWalletBalance, creditWallet, debitWallet, applyVerifiedTopup } from '../_lib/wallet.js'
import { notifyWithdrawalFailed, notifyWithdrawalStarted } from '../_lib/notifications.js'
import { getConversations, getThread, threadAction } from '../_lib/bookingThreads.js'
import { bookingError, requireBookingId, requireAmount, messageText } from '../_lib/bookingRules.js'
import { emitMyDealsEvent, getMyDeals, respondBookingRequest, writeBookingCreatedNotifications } from '../_lib/myDeals.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  // GET /api/escrows?mine=1 — "My Bookings" (escrows created as a client).
  // GET /api/escrows?wallet=1 — wallet balance + transaction history.
  // Both folded into this same function (Vercel Hobby's 12-function cap)
  // rather than dedicated /api/bookings or /api/wallet endpoints.
  if (req.method === 'GET') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      const url = new URL(req.url, `http://${req.headers.host}`)

      if (url.searchParams.get('conversations') === '1') {
        return json(res, 200, await getConversations(session.sub, url.searchParams.get('before')))
      }
      if (url.searchParams.get('messages') === '1') {
        return json(res, 200, await getThread(session.sub, url.searchParams.get('escrow_id'), url.searchParams.get('before'), url.searchParams.get('events_before')))
      }
      if (url.searchParams.get('deals') === '1') {
        return json(res, 200, await getMyDeals(session.sub))
      }

      if (url.searchParams.get('wallet') === '1') {
        const balance = await getWalletBalance(session.sub)
        const { rows: transactions } = await query(
          `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.status, wt.reference, wt.escrow_id, wt.created_at,
                  -- The other side of a booking payment (display only): the talent when the
                  -- viewer is the client, the client when the viewer is the talent.
                  cp.username as counterparty_username, cp.full_name as counterparty_full_name,
                  cp.role as counterparty_role, cp.company_suffix as counterparty_company_suffix,
                  cp.avatar_url as counterparty_avatar
           FROM wallet_transactions wt
           LEFT JOIN escrows e ON e.id = wt.escrow_id
           LEFT JOIN users cp ON cp.id = CASE WHEN e.client_id = wt.user_id THEN e.talent_id ELSE e.client_id END
           WHERE wt.user_id = $1 ORDER BY wt.created_at DESC LIMIT 100`,
          [session.sub],
        )
        return json(res, 200, { wallet: { balance, transactions } })
      }

      if (url.searchParams.get('mine') !== '1') {
        return methodNotAllowed(res, ['POST'])
      }

      const { rows } = await query(
        `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, e.status,
                e.contacts_unlocked, e.created_at, e.released_at, e.work_status, e.work_version,
                h.hat_title, h.category, h.role as hat_role, h.currency,
                u.id as talent_user_id, u.username as talent_username,
                u.full_name as talent_full_name, u.avatar_url as talent_avatar,
                u.role as talent_role, u.company_suffix as talent_company_suffix,
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
      if (!err.status) console.error(err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Failed to fetch bookings' })
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'A JSON object is required.' })

    if (['send_message', 'make_offer', 'respond_offer', 'read_messages'].includes(body.action)) {
      return json(res, 200, await threadAction(session.sub, body))
    }
    if (body.action === 'respond_booking') {
      return json(res, 200, await respondBookingRequest(session.sub, body.escrow_id, body.status))
    }

    // Wallet actions — dispatched by body.action, same pattern as the
    // fund/release split in api/escrows/[id]/[action].js, kept in this
    // file rather than a dedicated /api/wallet endpoint for the same
    // function-cap reason as the webhook above.
    if (body.action === 'topup') return handleTopup(res, session, body)
    if (body.action === 'withdraw') return handleWithdraw(res, session, body)
    if (body.action) return json(res, 400, { error: 'Unknown booking action.' })

    const { hat_id } = body
    requireBookingId(hat_id)
    const result = await createBooking(session.sub, hat_id, {
      proposedAmount: body.proposed_amount,
      proposalMessage: body.proposal_message,
    })
    return json(res, result.already_exists ? 200 : 201, result)
  } catch (err) {
    if (!err.status) console.error(err)
    return json(res, err.status || 500, { error: err.status ? err.message : 'Failed to update booking' })
  }
}

async function createBooking(userId, hatId, proposal = {}) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    // Serialize creation for this hat, including double taps and retries.
    const { rows: hats } = await client.query(`SELECT * FROM hats WHERE id = $1 FOR UPDATE`, [hatId])
    const hat = hats[0]
    if (!hat) throw bookingError(404, 'Hat not found.')
    if (!hat.active || hat.role !== 'talent') throw bookingError(400, 'Only active talent hats can be booked.')
    if (hat.user_id === userId) throw bookingError(400, "You can't book your own hat.")
    if (hat.currency !== 'NGN') throw bookingError(400, 'Booking payments currently support NGN only.')
    const { rows: existing } = await client.query(
      `SELECT * FROM escrows WHERE hat_id = $1 AND client_id = $2 AND status IN ('not_funded', 'secured')
       ORDER BY created_at DESC LIMIT 1`, [hatId, userId],
    )
    let escrow = existing[0]
    if (!escrow) {
      const amount = Number(hat.price_type === 'range' ? hat.price_min : hat.rate)
      if (!Number.isInteger(amount) || amount <= 0) throw bookingError(400, 'This Hat has no price set yet.')
      const payUnit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit
      const agreedAt = hat.price_type === 'range' ? null : new Date()
      const { rows } = await client.query(
        `INSERT INTO escrows (hat_id, client_id, talent_id, amount, request_kind, currency, pay_unit, agreed_at)
         VALUES ($1, $2, $3, $4, 'booking', $5, $6, $7) RETURNING *`,
        [hatId, userId, hat.user_id, amount, hat.currency || 'NGN', payUnit || null, agreedAt],
      )
      escrow = rows[0]

      if (hat.price_type === 'range' && proposal.proposedAmount != null) {
        const proposedAmount = requireAmount(Number(proposal.proposedAmount))
        if (proposedAmount < Number(hat.price_min) || proposedAmount > Number(hat.price_max)) {
          throw bookingError(409, 'Your proposal must stay within the Hat price range.')
        }
        const proposalText = messageText(typeof proposal.proposalMessage === 'string' ? proposal.proposalMessage : '', escrow, false)
        await client.query(
          `INSERT INTO booking_messages
             (escrow_id, sender_id, recipient_id, kind, body, amount, currency, pay_unit, offer_status, client_token)
           VALUES ($1,$2,$3,'offer',$4,$5,$6,$7,'pending',$8)`,
          [escrow.id, userId, hat.user_id, proposalText, proposedAmount, hat.currency || 'NGN', payUnit || null, randomUUID()],
        )
        await client.query('UPDATE escrows SET messages_updated_at = NOW() WHERE id = $1', [escrow.id])
      }
    }
    const alreadyExists = Boolean(existing[0])
    let notificationBooking = null
    if (!alreadyExists) {
      notificationBooking = await writeBookingCreatedNotifications(client, escrow.id)
    }

    await client.query('COMMIT')
    if (notificationBooking) {
      emitMyDealsEvent(
        [notificationBooking.client_id, notificationBooking.talent_id],
        'booking_requested',
      )
    }
    return { escrow, already_exists: alreadyExists }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
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
    const refunded = await refundFailedWithdrawal(session.sub, reference, amount)
    if (refunded) await notifyWithdrawalFailed({ userId: session.sub, amount })
    return json(res, 502, {
      error: refunded
        ? `${err.message || 'Could not initiate the withdrawal.'} Your balance has been refunded.`
        : `${err.message || 'Could not initiate the withdrawal.'} Your refund needs manual reconciliation.`,
    })
  }

  // Same OTP caveat as the old escrow release used to have: 'success'
  // only happens with OTP disabled for API transfers on the Paystack
  // business account. Anything else needs manual finalization in the
  // Paystack dashboard before the talent actually receives the money.
  const payoutStatus = transfer.status === 'success' ? 'success' : 'pending'
  await query(`UPDATE wallet_transactions SET status = $1 WHERE reference = $2`, [payoutStatus, reference])
  const balance = await getWalletBalance(session.sub)
  await notifyWithdrawalStarted({ userId: session.sub, amount, payoutStatus })
  return json(res, 200, { balance, payoutStatus })
}

async function refundFailedWithdrawal(userId, reference, amount) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await creditWallet(client, { userId, amount, type: 'refund', reference: `${reference}_refund` })
    await client.query(`UPDATE wallet_transactions SET status = 'failed' WHERE reference = $1`, [reference])
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    // If even the refund fails, the debit above already committed — the
    // money isn't lost, just stuck. Needs manual reconciliation.
    console.error('Wallet withdrawal refund failed — needs manual reconciliation:', { userId, reference, amount }, err)
    return false
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
  const isWalletTopup = data.metadata?.wallet_topup === true || data.metadata?.wallet_topup === 'true'
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
