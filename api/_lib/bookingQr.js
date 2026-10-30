import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getClient, query } from './db.js'
import { bookingError, requireAmount, requireBookingId } from './bookingRules.js'
import { creditWallet } from './wallet.js'
import { bookGigRelease } from './gigFees.js'
import { emitMyDealsEvent } from './myDeals.js'
import { dispatchStoredNotifications } from './pushNotifications.js'

const TOKEN_LIFETIME_MINUTES = 5
const TOKEN_PATTERN = /^CT1\.([0-9a-f-]{36})\.(start|completion)\.([a-zA-Z0-9_-]{43})$/
const digest = (value) => createHash('sha256').update(value).digest('hex')

export function startShare(amount) {
  return Math.floor(requireAmount(Number(amount)) * 3 / 10)
}

export async function issueBookingQr(userId, escrowId, stage) {
  requireBookingId(escrowId)
  if (!['start', 'completion'].includes(stage)) throw bookingError(400, 'Choose a valid QR checkpoint.')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM escrows WHERE id = $1 FOR UPDATE', [escrowId])
    const escrow = rows[0]
    if (!escrow || escrow.client_id !== userId) throw bookingError(404, 'Booking not found.')
    if (escrow.status !== 'secured' || escrow.work_status !== (stage === 'start' ? 'awaiting_start' : 'awaiting_completion')) {
      throw bookingError(409, 'This QR checkpoint is not available for the current booking state.')
    }
    const token = `CT1.${escrowId}.${stage}.${randomBytes(32).toString('base64url')}`
    const { rows: issued } = await client.query(
      `INSERT INTO booking_qr_tokens (escrow_id, stage, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4::int * INTERVAL '1 minute'))
       ON CONFLICT (escrow_id, stage) DO UPDATE SET token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at, consumed_at = NULL, created_at = NOW()
       RETURNING expires_at`,
      [escrowId, stage, digest(token), TOKEN_LIFETIME_MINUTES],
    )
    await client.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE user_id = $1 AND type = 'booking_checkpoint' AND read_at IS NULL
         AND metadata->>'escrow_id' = $2 AND metadata->>'stage' = $3 AND metadata->>'event' = 'qr_ready'`,
      [escrow.talent_id, escrowId, stage],
    )
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
       VALUES ($1, 'booking_checkpoint', $2, $3, $4, $5::jsonb)
       RETURNING id, user_id, type, title, body, link_url, metadata, read_at, created_at`,
      [escrow.talent_id,
        stage === 'start' ? 'Start QR ready' : 'Completion QR ready',
        stage === 'start'
          ? 'The client generated the Start QR. Open the deal when you are together to begin work.'
          : 'The client generated the Completion QR. Scan it to receive the remaining escrow balance.',
        `/deals/${escrowId}?role=talent`,
        JSON.stringify({ escrow_id: escrowId, stage, event: 'qr_ready' })],
    )
    await client.query('COMMIT')
    return { token, stage, expiresAt: issued[0].expires_at, amount: stage === 'start'
      ? startShare(escrow.amount) : Number(escrow.amount) - Number(escrow.start_released_amount) }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally { client.release() }
}


export async function dispatchBookingQrReadyNotification(userId, escrowId, stage) {
  requireBookingId(escrowId)
  if (!['start', 'completion'].includes(stage)) throw bookingError(400, 'Choose a valid QR checkpoint.')

  const { rows: bookings } = await query(
    'SELECT id, status, work_status, talent_id FROM escrows WHERE id = $1 AND client_id = $2',
    [escrowId, userId],
  )
  const booking = bookings[0]
  if (!booking) throw bookingError(404, 'Booking not found.')
  if (booking.status !== 'secured' || booking.work_status !== (stage === 'start' ? 'awaiting_start' : 'awaiting_completion')) {
    throw bookingError(409, 'This QR checkpoint is no longer available.')
  }

  // Push delivery is triggered by a separate request after the QR is rendered.
  // Claim the notification atomically so retries cannot send duplicate pushes.
  const { rows: notifications } = await query(
    `WITH target AS (
       SELECT n.id
       FROM notifications n
       JOIN booking_qr_tokens t ON t.escrow_id = $1 AND t.stage = $2
       WHERE n.user_id = $3
         AND n.type = 'booking_checkpoint'
         AND COALESCE(n.metadata, '{}'::jsonb)->>'escrow_id' = $1::text
         AND COALESCE(n.metadata, '{}'::jsonb)->>'stage' = $2
         AND COALESCE(n.metadata, '{}'::jsonb)->>'event' = 'qr_ready'
         AND t.expires_at > NOW()
         AND t.consumed_at IS NULL
         AND n.created_at >= t.created_at
         AND NOT (COALESCE(n.metadata, '{}'::jsonb) ? 'push_dispatch_requested_at')
       ORDER BY n.created_at DESC
       LIMIT 1
       FOR UPDATE OF n
     )
     UPDATE notifications n
     SET metadata = COALESCE(n.metadata, '{}'::jsonb) ||
       jsonb_build_object('push_dispatch_requested_at', NOW())
     FROM target
     WHERE n.id = target.id
       AND NOT (COALESCE(n.metadata, '{}'::jsonb) ? 'push_dispatch_requested_at')
     RETURNING n.id, n.user_id, n.type, n.title, n.body, n.link_url, n.metadata, n.read_at, n.created_at`,
    [escrowId, stage, booking.talent_id],
  )
  if (!notifications.length) return { queued: false }
  await dispatchStoredNotifications(notifications)
  return { queued: true }
}

export async function redeemBookingQr(userId, escrowId, token) {
  requireBookingId(escrowId)
  const match = typeof token === 'string' && token.length < 150 ? TOKEN_PATTERN.exec(token) : null
  if (!match || match[1] !== escrowId) throw bookingError(400, 'Scan a valid code for this booking.')
  const stage = match[2]
  const client = await getClient()
  let participants
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM escrows WHERE id = $1 FOR UPDATE', [escrowId])
    const escrow = rows[0]
    if (!escrow || escrow.talent_id !== userId) throw bookingError(404, 'Booking not found.')
    const { rows: issued } = await client.query(
      `SELECT token_hash, consumed_at, expires_at <= NOW() AS expired
       FROM booking_qr_tokens WHERE escrow_id = $1 AND stage = $2 FOR UPDATE`, [escrowId, stage],
    )
    const record = issued[0]
    const storedHash = record?.token_hash?.trim()
    if (!storedHash || !timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(digest(token), 'hex'))) {
      throw bookingError(409, 'This QR code has been replaced. Ask the client to generate a new one.')
    }
    if (record.consumed_at) {
      await client.query('COMMIT')
      return { escrow: { id: escrow.id, status: escrow.status, work_status: escrow.work_status,
        work_version: escrow.work_version, start_released_amount: escrow.start_released_amount }, alreadyProcessed: true }
    }
    if (record.expired) throw bookingError(410, 'This QR code expired. Ask the client to generate another one.')
    if (escrow.status !== 'secured' || escrow.work_status !== (stage === 'start' ? 'awaiting_start' : 'awaiting_completion')) {
      throw bookingError(409, 'This booking is not ready for that QR checkpoint.')
    }
    const amount = stage === 'start' ? startShare(escrow.amount)
      : Number(escrow.amount) - Number(escrow.start_released_amount)
    const settlement = await bookGigRelease(client,escrow,{
      stage,gross:amount,previousGross:Number(escrow.start_released_amount||0),
    })
    if (settlement.net > 0) await creditWallet(client, {
      userId: escrow.talent_id, amount:settlement.net, type: stage === 'start' ? 'escrow_start' : 'escrow_release', escrowId,
    })
    const { rows: updated } = await client.query(
      stage === 'start'
        ? `UPDATE escrows SET work_status = 'in_progress', work_started_at = NOW(), start_released_amount = $2,
           work_version = work_version + 1, messages_updated_at = NOW() WHERE id = $1 RETURNING *`
        : `UPDATE escrows SET work_status = 'completed', status = 'released', released_at = NOW(),
           work_version = work_version + 1, messages_updated_at = NOW() WHERE id = $1 RETURNING *`,
      stage === 'start' ? [escrowId, amount] : [escrowId],
    )
    await client.query('UPDATE booking_qr_tokens SET consumed_at = NOW() WHERE escrow_id = $1 AND stage = $2', [escrowId, stage])
    await client.query(
      `INSERT INTO booking_events (escrow_id, actor_id, action, note, expected_version, client_token)
       VALUES ($1, $2, $3, '', $4, $5)`,
      [escrowId, userId, stage === 'start' ? 'scan_start' : 'scan_completion', escrow.work_version, randomUUID()],
    )
    const pushNotifications = []
    for (const recipient of [escrow.client_id, escrow.talent_id]) {
      const role = recipient === escrow.client_id ? 'client' : 'talent'
      const { rows: notificationRows } = await client.query(
        `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
         VALUES ($1, 'booking_checkpoint', $2, $3, $4, $5::jsonb)
         RETURNING id, user_id, type, title, body, link_url, metadata, read_at, created_at`,
        [recipient, stage === 'start' ? 'Work started' : 'Booking completed',
          stage === 'start' ? 'Work started. The agreed 30% gross tranche was settled less the disclosed gig commission.'
            : 'The remaining escrow tranche was settled less the disclosed gig commission.',
          `/deals/${escrowId}?role=${role}`, JSON.stringify({ escrow_id: escrowId, stage, event: 'qr_scanned' })],
      )
      if (notificationRows[0]) pushNotifications.push(notificationRows[0])
    }
    await client.query('COMMIT')
    if (pushNotifications.length) await dispatchStoredNotifications(pushNotifications)
    participants = [escrow.client_id, escrow.talent_id]
    return { escrow: { id: updated[0].id, status: updated[0].status,
      work_status: updated[0].work_status, work_version: updated[0].work_version,
      start_released_amount: updated[0].start_released_amount }, amount:settlement.net, grossAmount:amount, platformFee:settlement.fee, alreadyProcessed: false }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
    if (participants) emitMyDealsEvent(participants, 'booking_checkpoint')
  }
}
