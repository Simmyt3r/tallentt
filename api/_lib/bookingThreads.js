import { query, getClient } from './db.js'
import { bookingError, requireBookingId, requireAmount, assertNegotiable, assertPriceEditable, messageText, canShareContacts } from './bookingRules.js'
import { lifecycleHistory } from './bookingLifecycle.js'

export async function withBooking(userId, escrowId, operation) {
  requireBookingId(escrowId)
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT e.*, h.hat_title, h.price_negotiable
       FROM escrows e JOIN hats h ON h.id = e.hat_id
       WHERE e.id = $1 AND ($2 = e.client_id OR $2 = e.talent_id) FOR UPDATE OF e`,
      [escrowId, userId],
    )
    if (!rows[0]) throw bookingError(404, 'Booking not found.')
    const result = await operation(client, rows[0])
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function getConversations(userId, before) {
  if (before) requireBookingId(before)
  const { rows } = await query(
    `SELECT e.id, e.hat_id, e.amount, e.status, e.work_status, e.created_at, h.hat_title,
            u.username AS peer_username, u.avatar_url AS peer_avatar,
            (SELECT COUNT(*)::int FROM booking_messages m
             WHERE m.escrow_id = e.id AND m.recipient_id = $1 AND m.read_at IS NULL) AS unread_count
     FROM escrows e JOIN hats h ON h.id = e.hat_id
     JOIN users u ON u.id = CASE WHEN e.client_id = $1 THEN e.talent_id ELSE e.client_id END
     WHERE (e.client_id = $1 OR e.talent_id = $1)
       AND ($2::uuid IS NULL OR (COALESCE(e.messages_updated_at, e.created_at), e.id) <
         (SELECT COALESCE(messages_updated_at, created_at), id FROM escrows WHERE id = $2 AND (client_id = $1 OR talent_id = $1)))
     ORDER BY COALESCE(e.messages_updated_at, e.created_at) DESC, e.id DESC LIMIT 51`,
    [userId, before || null],
  )
  return { conversations: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null }
}

export async function getThread(userId, escrowId, before, eventsBefore) {
  if (before && !/^[1-9]\d{0,18}$/.test(before)) throw bookingError(400, 'Invalid message cursor.')
  return withBooking(userId, escrowId, async (client, escrow) => {
    const { rows } = await client.query(
      `SELECT id::text, sender_id, kind, body, amount, offer_status, read_at, created_at, updated_at
       FROM booking_messages WHERE escrow_id = $1 AND ($2::bigint IS NULL OR id < $2)
       ORDER BY booking_messages.id DESC LIMIT 51`, [escrowId, before || null],
    )
    const { rows: offers } = await client.query(
      `SELECT id::text, sender_id, kind, body, amount, offer_status, created_at, updated_at
       FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`, [escrowId],
    )
    const { rows: peers } = await client.query(
      `SELECT username, avatar_url,
              CASE WHEN $2 THEN email ELSE NULL END AS email,
              CASE WHEN $2 THEN phone ELSE NULL END AS phone
       FROM users WHERE id = $1`,
      [userId === escrow.client_id ? escrow.talent_id : escrow.client_id, canShareContacts(escrow)],
    )
    // Explicit fields keep provider references and other internal metadata private.
    return {
      thread: { id: escrow.id, hat_id: escrow.hat_id, hat_title: escrow.hat_title,
        amount: escrow.amount, status: escrow.status, is_client: userId === escrow.client_id,
        work_status: escrow.work_status, work_version: escrow.work_version,
        contacts_unlocked: canShareContacts(escrow), price_negotiable: escrow.price_negotiable,
        checkout_locked_at: escrow.checkout_locked_at, card_checkout_started: Boolean(escrow.checkout_reference),
        peer: peers[0], pending_offer: offers[0] || null },
      messages: rows.slice(0, 50).reverse(), nextCursor: rows.length > 50 ? rows[49].id : null,
      ...(await lifecycleHistory(client, escrowId, eventsBefore)),
    }
  })
}

async function notifyThread(client, escrow, senderId, title) {
  const peerId = senderId === escrow.client_id ? escrow.talent_id : escrow.client_id
  // Coalesce unread thread alerts, without including message bodies or contact data.
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
     SELECT $1, 'booking_message', $2, 'Open the booking conversation to view the update.', $3, $4::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM notifications
       WHERE user_id = $1 AND type = 'booking_message' AND read_at IS NULL AND metadata->>'escrow_id' = $5)`,
    [peerId, title, `/messages?escrow=${escrow.id}`, JSON.stringify({ escrow_id: escrow.id }), escrow.id],
  )
}

export async function threadAction(userId, body) {
  return withBooking(userId, body.escrow_id, async (client, escrow) => {
    if (body.action === 'read_messages') {
      if (typeof body.through_id !== 'string' || !/^[1-9]\d{0,18}$/.test(body.through_id)) {
        throw bookingError(400, 'Invalid message cursor.')
      }
      await client.query(
        `UPDATE booking_messages SET read_at = COALESCE(read_at, NOW())
         WHERE escrow_id = $1 AND recipient_id = $2 AND id <= $3::bigint`,
        [escrow.id, userId, body.through_id],
      )
      await client.query(
        `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND type = 'booking_message'
         AND read_at IS NULL AND metadata->>'escrow_id' = $2
         AND NOT EXISTS (SELECT 1 FROM booking_messages WHERE escrow_id = $2::uuid AND recipient_id = $1 AND read_at IS NULL)`,
        [userId, escrow.id],
      )
      return { ok: true }
    }
    if (['send_message', 'make_offer'].includes(body.action)) {
      requireBookingId(body.client_token)
      const { rows: duplicate } = await client.query(
        `SELECT id::text FROM booking_messages WHERE escrow_id = $1 AND sender_id = $2 AND client_token = $3`,
        [escrow.id, userId, body.client_token],
      )
      if (duplicate[0]) return { id: duplicate[0].id, alreadyProcessed: true }
    }
    if (['cancelled', 'refunded'].includes(escrow.status)) throw bookingError(409, 'This booking is closed. Its conversation is read-only.')

    if (body.action === 'send_message' || body.action === 'make_offer') {
      const isOffer = body.action === 'make_offer'
      const text = messageText(body.body, escrow, !isOffer)
      if (isOffer) {
        assertNegotiable(escrow)
        requireAmount(body.amount)
        const { rows: pending } = await client.query(
          `SELECT id::text FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`, [escrow.id],
        )
        if (body.expected_offer_id !== (pending[0]?.id || null)) {
          throw bookingError(409, 'The offer changed. Review the latest offer before sending a counteroffer.')
        }
        await client.query(
          `UPDATE booking_messages SET offer_status = 'superseded', updated_at = NOW(), read_at = NOW()
           WHERE escrow_id = $1 AND offer_status = 'pending'`, [escrow.id],
        )
      }
      const { rows: rate } = await client.query(
        `SELECT COUNT(*)::int AS count FROM booking_messages
         WHERE escrow_id = $1 AND sender_id = $2 AND created_at > NOW() - INTERVAL '1 minute'`, [escrow.id, userId],
      )
      if (rate[0].count >= 20) throw bookingError(429, 'Too many messages. Please wait a minute.')
      const { rows } = await client.query(
        `INSERT INTO booking_messages (escrow_id, sender_id, kind, body, amount, offer_status, client_token, recipient_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
        [escrow.id, userId, isOffer ? 'offer' : 'message', text,
          isOffer ? body.amount : null, isOffer ? 'pending' : null, body.client_token,
          userId === escrow.client_id ? escrow.talent_id : escrow.client_id],
      )
      await notifyThread(client, escrow, userId, isOffer ? 'New price offer' : 'New booking message')
      await client.query(`UPDATE escrows SET messages_updated_at = NOW() WHERE id = $1`, [escrow.id])
      return { id: rows[0].id }
    }

    if (body.action === 'respond_offer') {
      if (typeof body.offer_id !== 'string' || !/^[1-9]\d{0,18}$/.test(body.offer_id)
        || !['accepted', 'declined', 'withdrawn'].includes(body.status)) {
        throw bookingError(400, 'Choose a valid offer and response.')
      }
      const { rows } = await client.query(
        `SELECT * FROM booking_messages WHERE id = $1 AND escrow_id = $2 AND kind = 'offer'`,
        [body.offer_id, escrow.id],
      )
      const offer = rows[0]
      if (!offer) throw bookingError(404, 'Offer not found.')
      const isOwn = offer.sender_id === userId
      if ((isOwn && body.status !== 'withdrawn') || (!isOwn && body.status === 'withdrawn')) {
        throw bookingError(403, 'Only the recipient can accept or decline an offer; only the sender can withdraw it.')
      }
      if (offer.offer_status === body.status) return { ok: true, alreadyProcessed: true }
      assertPriceEditable(escrow)
      if (offer.offer_status !== 'pending') throw bookingError(409, 'This offer is no longer pending.')
      await client.query(
        `UPDATE booking_messages SET offer_status = $1, updated_at = NOW(), read_at = NULL, recipient_id = $3 WHERE id = $2`,
        [body.status, body.offer_id, userId === escrow.client_id ? escrow.talent_id : escrow.client_id],
      )
      if (body.status === 'accepted') {
        await client.query(`UPDATE escrows SET amount = $1 WHERE id = $2`, [offer.amount, escrow.id])
      }
      await notifyThread(client, escrow, userId, `Price offer ${body.status}`)
      await client.query(`UPDATE escrows SET messages_updated_at = NOW() WHERE id = $1`, [escrow.id])
      return { ok: true }
    }
    throw bookingError(400, 'Unknown messaging action.')
  })
}

export async function assertNoPendingOffer(client, escrowId) {
  const { rows } = await client.query(
    `SELECT id FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`, [escrowId],
  )
  if (rows[0]) throw bookingError(409, 'Accept, decline, or withdraw the pending offer before paying.')
}
