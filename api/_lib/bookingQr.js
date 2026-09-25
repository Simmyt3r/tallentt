import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getClient } from './db.js'
import { bookingError, requireAmount, requireBookingId } from './bookingRules.js'
import { creditWallet } from './wallet.js'
import { emitMyDealsEvent } from './myDeals.js'

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
    await client.query('COMMIT')
    return { token, stage, expiresAt: issued[0].expires_at, amount: stage === 'start'
      ? startShare(escrow.amount) : Number(escrow.amount) - Number(escrow.start_released_amount) }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally { client.release() }
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
    if (amount > 0) await creditWallet(client, {
      userId: escrow.talent_id, amount, type: stage === 'start' ? 'escrow_start' : 'escrow_release', escrowId,
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
    for (const recipient of [escrow.client_id, escrow.talent_id]) await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
       VALUES ($1, 'booking_lifecycle', $2, $3, $4, $5::jsonb)`,
      [recipient, stage === 'start' ? 'Work started' : 'Booking completed',
        stage === 'start' ? '30% of the booking was released to the talent wallet.'
          : 'The remaining escrow balance was released to the talent wallet.',
        `/messages?escrow=${escrowId}`, JSON.stringify({ escrow_id: escrowId })],
    )
    await client.query('COMMIT')
    participants = [escrow.client_id, escrow.talent_id]
    return { escrow: { id: updated[0].id, status: updated[0].status,
      work_status: updated[0].work_status, work_version: updated[0].work_version,
      start_released_amount: updated[0].start_released_amount }, amount, alreadyProcessed: false }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
    if (participants) emitMyDealsEvent(participants, 'booking_checkpoint')
  }
}
