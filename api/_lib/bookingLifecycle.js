import { getClient, query } from './db.js'
import { bookingError, requireBookingId, requireAmount, messageText } from './bookingRules.js'
import { creditWallet } from './wallet.js'

const titles = {
  submit_delivery: 'Work submitted for review', request_revision: 'Revisions requested',
  open_dispute: 'Booking dispute opened', approve_delivery: 'Work approved and payment released',
  resolve_release: 'Dispute resolved: payment released', resolve_refund: 'Dispute resolved: wallet refunded',
}
const publicState = (e) => ({ id: e.id, status: e.status, work_status: e.work_status,
  work_version: e.work_version, amount: e.amount, released_at: e.released_at, refunded_at: e.refunded_at })

function cursor(value) {
  if (value != null && (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)) {
    throw bookingError(400, 'Invalid history cursor.')
  }
  return value || null
}

export async function lifecycleHistory(client, escrowId, before) {
  const { rows } = await client.query(
    `SELECT e.id::text, e.action, e.note, e.created_at, u.username AS actor_username
     FROM booking_events e JOIN users u ON u.id = e.actor_id
     WHERE e.escrow_id = $1 AND ($2::bigint IS NULL OR e.id < $2)
     ORDER BY e.id DESC LIMIT 51`, [escrowId, cursor(before)],
  )
  return { events: rows.slice(0, 50).reverse(), eventsCursor: rows.length > 50 ? rows[49].id : null }
}

// All lifecycle transitions, including both settlement paths, lock the booking
// before any wallet row. Notifications and the audit trail commit with the money.
export async function bookingLifecycle(userId, escrowId, action, body = {}, adminAction = false) {
  requireBookingId(escrowId)
  requireBookingId(body?.client_token)
  if (!Number.isSafeInteger(body?.expected_version) || body.expected_version < 0) {
    throw bookingError(400, 'Refresh the booking before taking this action.')
  }
  if (!Object.hasOwn(titles, action) || adminAction !== action.startsWith('resolve_')) {
    throw bookingError(400, 'Unknown booking action.')
  }
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM escrows WHERE id = $1 FOR UPDATE', [escrowId])
    const escrow = rows[0]
    if (!escrow) throw bookingError(404, 'Booking not found.')
    if (adminAction) {
      const { rows: admins } = await client.query('SELECT is_admin FROM users WHERE id = $1', [userId])
      if (!admins[0]?.is_admin) throw bookingError(403, 'Admin access required.')
      if ([escrow.client_id, escrow.talent_id].includes(userId)) {
        throw bookingError(403, 'Another admin must resolve a booking you participate in.')
      }
    } else if (![escrow.client_id, escrow.talent_id].includes(userId)) {
      throw bookingError(404, 'Booking not found.')
    }
    const { rows: retries } = await client.query(
      'SELECT action, note, expected_version FROM booking_events WHERE escrow_id = $1 AND actor_id = $2 AND client_token = $3',
      [escrowId, userId, body.client_token],
    )
    // Check the original request before the new state, so a lost response is safe
    // to retry even after completion or a refund closes the conversation.
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (retries[0]) {
      if (retries[0].action !== action || retries[0].note !== note || retries[0].expected_version !== body.expected_version) {
        throw bookingError(409, 'This retry token was already used for a different action.')
      }
      await client.query('COMMIT')
      return { escrow: publicState(escrow), alreadyProcessed: true }
    }
    if (escrow.work_version !== body.expected_version) throw bookingError(409, 'The booking changed. Refresh and review the latest update.')
    if (escrow.status !== 'secured') throw bookingError(409, 'Only a funded, unsettled booking can be updated.')
    messageText(body.note ?? '', escrow, action !== 'approve_delivery')
    let workStatus, settlement
    if (action === 'submit_delivery') {
      if (userId !== escrow.talent_id) throw bookingError(403, 'Only the talent can submit work.')
      if (!['in_progress', 'revision_requested'].includes(escrow.work_status)) throw bookingError(409, 'Work cannot be submitted in the current state.')
      workStatus = 'submitted'
    } else if (action === 'request_revision' || action === 'approve_delivery') {
      if (userId !== escrow.client_id) throw bookingError(403, 'Only the client can review delivery.')
      if (escrow.work_status !== 'submitted') throw bookingError(409, 'Review is available only after work is submitted and while no dispute is open.')
      workStatus = action === 'request_revision' ? 'revision_requested' : 'completed'
      if (action === 'approve_delivery') settlement = 'released'
    } else if (action === 'open_dispute') {
      if (!['in_progress', 'submitted', 'revision_requested'].includes(escrow.work_status)) throw bookingError(409, 'This booking already has a dispute.')
      workStatus = 'disputed'
      await client.query('INSERT INTO booking_disputes (escrow_id, opened_by, reason) VALUES ($1, $2, $3)', [escrowId, userId, note])
    } else {
      if (escrow.work_status !== 'disputed') throw bookingError(409, 'Only an open dispute can be resolved.')
      settlement = action === 'resolve_release' ? 'released' : 'refunded'
      workStatus = settlement === 'released' ? 'completed' : 'refunded'
      const { rows: disputes } = await client.query(
        `UPDATE booking_disputes SET status = $2, resolved_by = $3, resolution_note = $4, resolved_at = NOW()
         WHERE escrow_id = $1 AND status = 'open' RETURNING escrow_id`, [escrowId, settlement, userId, note],
      )
      if (!disputes[0]) throw bookingError(409, 'This dispute has already been resolved.')
    }
    if (settlement) {
      await creditWallet(client, { userId: settlement === 'released' ? escrow.talent_id : escrow.client_id,
        amount: requireAmount(escrow.amount), type: settlement === 'released' ? 'escrow_release' : 'refund', escrowId })
    }
    const { rows: updated } = await client.query(
      `UPDATE escrows SET work_status = $2, work_version = work_version + 1, status = COALESCE($3, status),
       released_at = CASE WHEN $3 = 'released' THEN NOW() ELSE released_at END,
       refunded_at = CASE WHEN $3 = 'refunded' THEN NOW() ELSE refunded_at END,
       contacts_unlocked = CASE WHEN $3 = 'refunded' THEN false ELSE contacts_unlocked END,
       messages_updated_at = NOW() WHERE id = $1 RETURNING *`, [escrowId, workStatus, settlement || null],
    )
    await client.query(
      `INSERT INTO booking_events (escrow_id, actor_id, action, note, expected_version, client_token)
       VALUES ($1, $2, $3, $4, $5, $6)`, [escrowId, userId, action, note, body.expected_version, body.client_token],
    )
    if (adminAction) await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'escrow', $3, $4::jsonb)`,
      [userId, action, escrowId, JSON.stringify({ amount: escrow.amount, outcome: settlement, reason: note })],
    )
    const recipients = adminAction ? [escrow.client_id, escrow.talent_id]
      : [userId === escrow.client_id ? escrow.talent_id : escrow.client_id]
    for (const recipient of recipients) await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
       VALUES ($1, 'booking_lifecycle', $2, $3, $4, $5::jsonb)`,
      [recipient, titles[action], settlement === 'refunded' ? 'The full booking amount was returned to the client wallet.'
        : 'Open the booking to review the update.', `/messages?escrow=${escrowId}`, JSON.stringify({ escrow_id: escrowId })],
    )
    if (action === 'open_dispute') await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
       SELECT id, 'booking_dispute', 'Booking dispute needs review', 'Review the evidence in the admin panel.',
         '/admin?tab=disputes', $1::jsonb FROM users WHERE is_admin = true AND id NOT IN ($2, $3)`,
      [JSON.stringify({ escrow_id: escrowId }), escrow.client_id, escrow.talent_id],
    )
    await client.query('COMMIT')
    return { escrow: publicState(updated[0]), alreadyProcessed: false }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally { client.release() }
}

// These readers are reachable only through the admin-authenticated endpoint.
export async function listDisputes(status = 'open', before) {
  if (!['open', 'released', 'refunded'].includes(status)) throw bookingError(400, 'Invalid dispute status.')
  if (before) requireBookingId(before)
  const { rows } = await query(
    `SELECT d.*, e.amount, h.hat_title, c.username AS client_username, t.username AS talent_username
     FROM booking_disputes d JOIN escrows e ON e.id = d.escrow_id
     LEFT JOIN hats h ON h.id = e.hat_id JOIN users c ON c.id = e.client_id JOIN users t ON t.id = e.talent_id
     WHERE d.status = $1 AND ($2::uuid IS NULL OR (d.created_at, d.escrow_id) >
       (SELECT created_at, escrow_id FROM booking_disputes WHERE escrow_id = $2 AND status = $1))
     ORDER BY d.created_at, d.escrow_id LIMIT 51`, [status, before || null],
  )
  return { disputes: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].escrow_id : null }
}

export async function getDispute(escrowId, messagesBefore, eventsBefore) {
  requireBookingId(escrowId)
  const { rows } = await query(
    `SELECT d.*, e.amount, e.work_version, e.work_status, c.username AS client_username, t.username AS talent_username
     FROM booking_disputes d JOIN escrows e ON e.id = d.escrow_id
     JOIN users c ON c.id = e.client_id JOIN users t ON t.id = e.talent_id WHERE d.escrow_id = $1`, [escrowId],
  )
  if (!rows[0]) throw bookingError(404, 'Dispute not found.')
  const { rows: messages } = await query(
    `SELECT m.id::text, m.kind, m.body, m.amount, m.offer_status, m.created_at, u.username AS sender_username
     FROM booking_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.escrow_id = $1 AND ($2::bigint IS NULL OR m.id < $2) ORDER BY m.id DESC LIMIT 51`, [escrowId, cursor(messagesBefore)],
  )
  return { dispute: rows[0], ...(await lifecycleHistory({ query }, escrowId, eventsBefore)),
    messages: messages.slice(0, 50).reverse(), messagesCursor: messages.length > 50 ? messages[49].id : null }
}
