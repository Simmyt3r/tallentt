import { getClient, query } from './db.js'
import { bookingError, requireBookingId } from './bookingRules.js'
import { notifyUser } from './notifications.js'
import { emitLiveEvent } from './liveRealtime.js'

function displayName(row, prefix, fallback) {
  return row?.[`${prefix}_full_name`] || (row?.[`${prefix}_username`] ? `^${row[`${prefix}_username`]}` : fallback)
}

export function emitMyDealsEvent(userIds, reason = 'changed') {
  for (const userId of [...new Set((userIds || []).filter(Boolean))]) {
    emitLiveEvent(userId, 'myDeals', { reason })
  }
}

export async function getMyDeals(userId) {
  const [bookingResult, applicationResult] = await Promise.all([
    query(
      `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, e.status, e.contacts_unlocked,
              e.created_at, e.funded_at, e.released_at, e.work_status,
              CASE
                WHEN e.status = 'not_funded' AND COALESCE(e.contacts_unlocked, false) = false THEN 'pending'
                ELSE 'accepted'
              END AS request_state,
              h.hat_title, h.hat_name, h.category, h.hat_type, h.hiring_duration,
              h.lga AS hat_lga, h.currency, h.role AS hat_role,
              client.username AS client_username, client.full_name AS client_full_name,
              client.avatar_url AS client_avatar, client.lga AS client_lga,
              client.role AS client_role, client.company_suffix AS client_company_suffix,
              talent.username AS talent_username, talent.full_name AS talent_full_name,
              talent.avatar_url AS talent_avatar, talent.lga AS talent_lga,
              talent.role AS talent_role, talent.company_suffix AS talent_company_suffix,
              (SELECT m.url FROM hat_media m WHERE m.hat_id = h.id ORDER BY m.created_at LIMIT 1) AS hat_thumbnail
       FROM escrows e
       JOIN hats h ON h.id = e.hat_id
       LEFT JOIN users client ON client.id = e.client_id
       LEFT JOIN users talent ON talent.id = e.talent_id
       WHERE (e.client_id = $1 OR e.talent_id = $1)
         AND e.status IN ('not_funded','secured')
       ORDER BY e.created_at DESC`,
      [userId],
    ),
    query(
      `SELECT a.id AS application_id, a.hat_id, a.applicant_id, a.status, a.message,
              a.created_at AS applied_at, a.updated_at,
              h.user_id AS owner_id, h.hat_title, h.hat_name, h.category, h.hat_type,
              h.hiring_duration, h.lga AS hat_lga, h.currency, h.role AS hat_role,
              h.price_type, h.rate, h.price_min, h.price_max,
              owner.username AS owner_username, owner.full_name AS owner_full_name,
              owner.avatar_url AS owner_avatar, owner.lga AS owner_lga,
              owner.role AS owner_role, owner.company_suffix AS owner_company_suffix,
              applicant.username AS applicant_username, applicant.full_name AS applicant_full_name,
              applicant.avatar_url AS applicant_avatar, applicant.lga AS applicant_lga,
              applicant.role AS applicant_role, applicant.company_suffix AS applicant_company_suffix,
              (SELECT m.url FROM hat_media m WHERE m.hat_id = h.id ORDER BY m.created_at LIMIT 1) AS hat_thumbnail
       FROM applications a
       JOIN hats h ON h.id = a.hat_id
       LEFT JOIN users owner ON owner.id = h.user_id
       LEFT JOIN users applicant ON applicant.id = a.applicant_id
       WHERE (a.applicant_id = $1 OR h.user_id = $1)
         AND a.status NOT IN ('rejected','withdrawn')
       ORDER BY a.created_at DESC`,
      [userId],
    ),
  ])

  const bookings = bookingResult.rows
  const applications = applicationResult.rows
  const pendingCount =
    bookings.filter((item) => item.request_state === 'pending').length +
    applications.filter((item) => item.status === 'pending').length

  return { bookings, applications, pendingCount }
}

async function bookingSnapshot(escrowId) {
  const { rows } = await query(
    `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, e.status, e.contacts_unlocked,
            h.hat_title,
            client.username AS client_username, client.full_name AS client_full_name,
            talent.username AS talent_username, talent.full_name AS talent_full_name
     FROM escrows e
     LEFT JOIN hats h ON h.id = e.hat_id
     LEFT JOIN users client ON client.id = e.client_id
     LEFT JOIN users talent ON talent.id = e.talent_id
     WHERE e.id = $1`,
    [escrowId],
  )
  return rows[0] || null
}

export async function notifyBookingCreated(escrowId) {
  try {
    const booking = await bookingSnapshot(escrowId)
    if (!booking) return null
    const clientName = displayName(booking, 'client', 'A client')
    const talentName = displayName(booking, 'talent', 'the talent')
    const title = booking.hat_title || 'this Hat'

    await Promise.all([
      notifyUser({
        userId: booking.talent_id,
        type: 'booking_requested',
        title: 'New booking request',
        body: `${clientName} wants to book you for ${title}.`,
        linkUrl: '/deals?role=talent&tab=incoming',
        metadata: { escrow_id: booking.id, hat_id: booking.hat_id },
      }),
      notifyUser({
        userId: booking.client_id,
        type: 'booking_sent',
        title: 'Booking request sent',
        body: `Your booking request for ${title} was sent to ${talentName}.`,
        linkUrl: '/deals?role=client&tab=outgoing',
        metadata: { escrow_id: booking.id, hat_id: booking.hat_id },
      }),
    ])
    emitMyDealsEvent([booking.client_id, booking.talent_id], 'booking_requested')
    return true
  } catch (error) {
    console.error('booking request notification failed:', error)
    return null
  }
}

export async function respondBookingRequest(userId, escrowId, status) {
  requireBookingId(escrowId)
  if (!['accepted', 'rejected', 'pending'].includes(status)) {
    throw bookingError(400, 'Choose a valid booking response.')
  }

  const client = await getClient()
  let booking
  let changed = false
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT e.*, h.hat_title,
              client_user.username AS client_username, client_user.full_name AS client_full_name,
              talent_user.username AS talent_username, talent_user.full_name AS talent_full_name
       FROM escrows e
       JOIN hats h ON h.id = e.hat_id
       LEFT JOIN users client_user ON client_user.id = e.client_id
       LEFT JOIN users talent_user ON talent_user.id = e.talent_id
       WHERE e.id = $1 FOR UPDATE OF e`,
      [escrowId],
    )
    booking = rows[0]
    if (!booking) throw bookingError(404, 'Booking request not found.')
    if (booking.talent_id !== userId) {
      throw bookingError(403, 'Only the requested talent can respond to this booking.')
    }

    if (status === 'accepted') {
      if (booking.status !== 'not_funded') {
        throw bookingError(409, 'This booking request is already closed.')
      }
      if (!booking.contacts_unlocked) {
        const updated = await client.query(
          `UPDATE escrows SET contacts_unlocked = true WHERE id = $1 RETURNING *`,
          [escrowId],
        )
        booking = { ...booking, ...updated.rows[0] }
        changed = true
      }
    } else if (status === 'rejected') {
      if (booking.status !== 'not_funded' || booking.contacts_unlocked) {
        throw bookingError(409, 'Only a pending booking request can be rejected.')
      }
      const updated = await client.query(
        `UPDATE escrows SET status = 'cancelled', contacts_unlocked = false WHERE id = $1 RETURNING *`,
        [escrowId],
      )
      booking = { ...booking, ...updated.rows[0] }
      changed = true
    } else {
      if (booking.status === 'cancelled') {
        const updated = await client.query(
          `UPDATE escrows SET status = 'not_funded', contacts_unlocked = false WHERE id = $1 RETURNING *`,
          [escrowId],
        )
        booking = { ...booking, ...updated.rows[0] }
        changed = true
      } else if (!(booking.status === 'not_funded' && !booking.contacts_unlocked)) {
        throw bookingError(409, 'Only a rejected request can be restored.')
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  if (changed) {
    const clientName = displayName(booking, 'client', 'The client')
    const talentName = displayName(booking, 'talent', 'The talent')
    const title = booking.hat_title || 'this Hat'

    if (status === 'accepted') {
      await Promise.all([
        notifyUser({
          userId: booking.client_id,
          type: 'booking_accepted',
          title: 'Booking accepted',
          body: `${talentName} accepted your booking request for ${title}.`,
          linkUrl: '/deals?role=client&tab=active',
          metadata: { escrow_id: booking.id, hat_id: booking.hat_id, status },
        }),
        notifyUser({
          userId: booking.talent_id,
          type: 'booking_accepted',
          title: 'Booking accepted',
          body: `You accepted ${clientName}'s booking request for ${title}.`,
          linkUrl: '/deals?role=talent&tab=active',
          metadata: { escrow_id: booking.id, hat_id: booking.hat_id, status },
        }),
      ])
    } else if (status === 'rejected') {
      await Promise.all([
        notifyUser({
          userId: booking.client_id,
          type: 'booking_rejected',
          title: 'Booking rejected',
          body: `${talentName} declined your booking request for ${title}.`,
          linkUrl: '/deals?role=client&tab=outgoing',
          metadata: { escrow_id: booking.id, hat_id: booking.hat_id, status },
        }),
        notifyUser({
          userId: booking.talent_id,
          type: 'booking_rejected',
          title: 'Booking rejected',
          body: `You declined ${clientName}'s booking request for ${title}.`,
          linkUrl: '/deals?role=talent&tab=incoming',
          metadata: { escrow_id: booking.id, hat_id: booking.hat_id, status },
        }),
      ])
    }

    emitMyDealsEvent([booking.client_id, booking.talent_id], `booking_${status}`)
  }

  return { booking }
}

async function applicationSnapshot(applicationId) {
  const { rows } = await query(
    `SELECT a.id AS application_id, a.hat_id, a.applicant_id, a.status,
            h.user_id AS owner_id, h.hat_title,
            owner.username AS owner_username, owner.full_name AS owner_full_name,
            applicant.username AS applicant_username, applicant.full_name AS applicant_full_name
     FROM applications a
     JOIN hats h ON h.id = a.hat_id
     LEFT JOIN users owner ON owner.id = h.user_id
     LEFT JOIN users applicant ON applicant.id = a.applicant_id
     WHERE a.id = $1`,
    [applicationId],
  )
  return rows[0] || null
}

export async function notifyApplicationCreated(applicationId) {
  try {
    const app = await applicationSnapshot(applicationId)
    if (!app) return null
    const applicantName = displayName(app, 'applicant', 'Someone')
    const ownerName = displayName(app, 'owner', 'the client')
    const title = app.hat_title || 'this Hat'

    await Promise.all([
      notifyUser({
        userId: app.owner_id,
        type: 'application_received',
        title: 'New application',
        body: `${applicantName} applied to ${title}.`,
        linkUrl: '/deals?role=client&tab=incoming',
        metadata: { application_id: app.application_id, hat_id: app.hat_id },
      }),
      notifyUser({
        userId: app.applicant_id,
        type: 'application_sent',
        title: 'Application sent',
        body: `Your application to ${ownerName} for ${title} was sent.`,
        linkUrl: '/deals?role=talent&tab=outgoing',
        metadata: { application_id: app.application_id, hat_id: app.hat_id },
      }),
    ])
    emitMyDealsEvent([app.owner_id, app.applicant_id], 'application_created')
    return true
  } catch (error) {
    console.error('application creation notification failed:', error)
    return null
  }
}

export async function notifyApplicationState(applicationId, status, actor = 'owner') {
  try {
    const app = await applicationSnapshot(applicationId)
    if (!app) return null
    const applicantName = displayName(app, 'applicant', 'The talent')
    const ownerName = displayName(app, 'owner', 'The client')
    const title = app.hat_title || 'this Hat'
    const accepted = status === 'accepted'
    const withdrawn = status === 'withdrawn'
    const restored = status === 'pending'
    const notificationTitle = accepted
      ? 'Application accepted'
      : withdrawn
        ? 'Application withdrawn'
        : restored
          ? 'Application restored'
          : 'Application rejected'

    await Promise.all([
      notifyUser({
        userId: app.applicant_id,
        type: `application_${status}`,
        title: notificationTitle,
        body: accepted
          ? `${ownerName} accepted your application for ${title}.`
          : withdrawn
            ? `You withdrew your application for ${title}.`
            : restored
              ? `Your application for ${title} is pending again.`
              : `${ownerName} declined your application for ${title}.`,
        linkUrl: accepted ? '/deals?role=talent&tab=active' : '/deals?role=talent&tab=outgoing',
        metadata: { application_id: app.application_id, hat_id: app.hat_id, status, actor },
      }),
      notifyUser({
        userId: app.owner_id,
        type: `application_${status}`,
        title: notificationTitle,
        body: accepted
          ? `You accepted ${applicantName}'s application for ${title}.`
          : withdrawn
            ? `${applicantName} withdrew their application for ${title}.`
            : restored
              ? `${applicantName}'s application for ${title} is pending again.`
              : `You declined ${applicantName}'s application for ${title}.`,
        linkUrl: accepted ? '/deals?role=client&tab=active' : '/deals?role=client&tab=incoming',
        metadata: { application_id: app.application_id, hat_id: app.hat_id, status, actor },
      }),
    ])
    emitMyDealsEvent([app.owner_id, app.applicant_id], `application_${status}`)
    return true
  } catch (error) {
    console.error('application status notification failed:', error)
    return null
  }
}

export async function respondApplicationDeal(ownerId, hatId, applicationId, status) {
  requireBookingId(hatId)
  requireBookingId(applicationId)
  if (!['accepted', 'rejected', 'pending'].includes(status)) {
    throw bookingError(400, 'Choose a valid application response.')
  }

  const client = await getClient()
  let application
  let escrow = null
  let changed = false
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT a.*, h.user_id AS owner_id, h.role AS hat_role, h.hat_title,
              h.price_type, h.rate, h.price_min, h.currency
       FROM applications a
       JOIN hats h ON h.id = a.hat_id
       WHERE a.id = $1 AND h.id = $2
       FOR UPDATE OF a, h`,
      [applicationId, hatId],
    )
    const current = rows[0]
    if (!current) throw bookingError(404, 'Application not found.')
    if (current.owner_id !== ownerId) {
      throw bookingError(403, 'Only the Hat owner can respond to this application.')
    }
    if (current.hat_role !== 'client') {
      throw bookingError(409, 'Only Client Hat applications can be accepted.')
    }

    if (status === 'accepted') {
      if (current.status === 'accepted') {
        application = current
      } else {
        if (current.status !== 'pending') {
          throw bookingError(409, 'Only a pending application can be accepted.')
        }
        const amount = Number(current.price_type === 'range' ? current.price_min : current.rate)
        if (!Number.isInteger(amount) || amount <= 0) {
          throw bookingError(409, 'This Hat needs a valid price before accepting an application.')
        }

        const existing = await client.query(
          `SELECT * FROM escrows
           WHERE hat_id = $1 AND client_id = $2 AND talent_id = $3
             AND status IN ('not_funded','secured')
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [hatId, ownerId, current.applicant_id],
        )

        if (existing.rows[0]) {
          escrow = existing.rows[0]
          if (escrow.status === 'not_funded' && !escrow.contacts_unlocked) {
            const unlocked = await client.query(
              `UPDATE escrows SET contacts_unlocked = true WHERE id = $1 RETURNING *`,
              [escrow.id],
            )
            escrow = unlocked.rows[0]
          }
        } else {
          const created = await client.query(
            `INSERT INTO escrows (hat_id, client_id, talent_id, amount, contacts_unlocked)
             VALUES ($1, $2, $3, $4, true) RETURNING *`,
            [hatId, ownerId, current.applicant_id, amount],
          )
          escrow = created.rows[0]
        }

        const updated = await client.query(
          `UPDATE applications SET status = 'accepted', updated_at = NOW() WHERE id = $1 RETURNING *`,
          [applicationId],
        )
        application = updated.rows[0]
        changed = true
      }
    } else if (status === 'rejected') {
      if (current.status !== 'pending') {
        throw bookingError(409, 'Only a pending application can be rejected.')
      }
      const updated = await client.query(
        `UPDATE applications SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [applicationId],
      )
      application = updated.rows[0]
      changed = true
    } else {
      if (current.status === 'pending') {
        application = current
      } else if (current.status === 'rejected') {
        const updated = await client.query(
          `UPDATE applications SET status = 'pending', updated_at = NOW() WHERE id = $1 RETURNING *`,
          [applicationId],
        )
        application = updated.rows[0]
        changed = true
      } else {
        throw bookingError(409, 'Only a rejected application can be restored.')
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  if (changed) await notifyApplicationState(applicationId, status, 'owner')
  return { application, escrow }
}
