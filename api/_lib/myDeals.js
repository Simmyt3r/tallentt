import { randomUUID } from 'node:crypto'
import { getClient, query } from './db.js'
import { bookingError, requireBookingId, requireAmount, messageText } from './bookingRules.js'
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
              e.created_at, e.funded_at, e.released_at, e.work_status, e.request_kind, e.application_id,
              e.currency AS deal_currency, e.pay_unit, e.agreed_at,
              CASE
                WHEN e.status = 'not_funded' AND COALESCE(e.contacts_unlocked, false) = false THEN 'pending'
                ELSE 'accepted'
              END AS request_state,
              h.hat_title, h.hat_name, h.category, h.hat_type, h.hiring_duration,
              h.lga AS hat_lga, h.currency, h.role AS hat_role, h.price_type, h.price_min, h.price_max,
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
              deal.id AS negotiation_escrow_id, deal.amount AS agreed_amount, deal.agreed_at,
              deal.currency AS deal_currency, deal.pay_unit,
              EXISTS (SELECT 1 FROM booking_messages po WHERE po.escrow_id = deal.id AND po.offer_status = 'pending') AS has_pending_offer,
              owner.username AS owner_username, owner.full_name AS owner_full_name,
              owner.avatar_url AS owner_avatar, owner.lga AS owner_lga,
              owner.role AS owner_role, owner.company_suffix AS owner_company_suffix,
              applicant.username AS applicant_username, applicant.full_name AS applicant_full_name,
              applicant.avatar_url AS applicant_avatar, applicant.lga AS applicant_lga,
              applicant.role AS applicant_role, applicant.company_suffix AS applicant_company_suffix,
              (SELECT m.url FROM hat_media m WHERE m.hat_id = h.id ORDER BY m.created_at LIMIT 1) AS hat_thumbnail
       FROM applications a
       JOIN hats h ON h.id = a.hat_id
       LEFT JOIN escrows deal ON deal.application_id = a.id AND deal.status IN ('not_funded','secured')
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
    bookings.filter((item) => item.request_kind !== 'application' && item.request_state === 'pending').length +
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
      `SELECT e.*, h.hat_title, h.price_type,
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
      if (booking.price_type === 'range') {
        const { rows: pending } = await client.query(
          `SELECT id FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`,
          [escrowId],
        )
        if (pending[0] || !booking.agreed_at) {
          throw bookingError(409, 'Agree the Range price before accepting this booking request.')
        }
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

export async function createApplicationRequest(applicantId, hatId, message, proposal = {}) {
  requireBookingId(hatId)
  const client = await getClient()
  let application
  let escrow = null
  let alreadyApplied = false
  try {
    await client.query('BEGIN')
    const { rows: hats } = await client.query(
      `SELECT * FROM hats WHERE id = $1 FOR UPDATE`,
      [hatId],
    )
    const hat = hats[0]
    if (!hat) throw bookingError(404, 'Hat not found.')
    if (!hat.active || hat.role !== 'client') throw bookingError(400, 'Only active Client Hats can receive applications.')
    if (hat.user_id === applicantId) throw bookingError(400, "You can't apply to your own Hat.")

    const { rows: existingApps } = await client.query(
      `SELECT * FROM applications WHERE hat_id = $1 AND applicant_id = $2 FOR UPDATE`,
      [hatId, applicantId],
    )
    const existing = existingApps[0]
    if (existing && ['pending','accepted'].includes(existing.status)) {
      application = existing
      alreadyApplied = true
    } else if (existing) {
      const { rows } = await client.query(
        `UPDATE applications SET status = 'pending', message = COALESCE($1, message),
         created_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
        [message || null, existing.id],
      )
      application = rows[0]
    } else {
      const { rows } = await client.query(
        `INSERT INTO applications (hat_id, applicant_id, message) VALUES ($1,$2,$3) RETURNING *`,
        [hatId, applicantId, message || null],
      )
      application = rows[0]
    }

    if (!alreadyApplied && hat.price_type === 'range') {
      const hasInitialProposal = proposal.proposedAmount != null
      const proposedAmount = hasInitialProposal ? requireAmount(Number(proposal.proposedAmount)) : null
      if (hasInitialProposal && (proposedAmount < Number(hat.price_min) || proposedAmount > Number(hat.price_max))) {
        throw bookingError(409, 'Your proposal must stay within the Hat price range.')
      }
      const payUnit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit
      const { rows: existingDeals } = await client.query(
        `SELECT * FROM escrows WHERE application_id = $1 FOR UPDATE`,
        [application.id],
      )
      escrow = existingDeals[0]
      if (escrow) {
        await client.query(
          `UPDATE booking_messages SET offer_status = 'superseded', updated_at = NOW()
           WHERE escrow_id = $1 AND offer_status = 'pending'`,
          [escrow.id],
        )
        const { rows } = await client.query(
          `UPDATE escrows SET status = 'not_funded', contacts_unlocked = false, amount = $2,
           currency = $3, pay_unit = $4, agreed_at = NULL, checkout_locked_at = NULL,
           checkout_reference = NULL, payment_reference = NULL, funded_at = NULL, released_at = NULL,
           messages_updated_at = NOW() WHERE id = $1 RETURNING *`,
          [escrow.id, Number(hat.price_min), hat.currency || 'NGN', payUnit || null],
        )
        escrow = rows[0]
      } else {
        const { rows } = await client.query(
          `INSERT INTO escrows
             (hat_id, client_id, talent_id, amount, application_id, request_kind, currency, pay_unit, contacts_unlocked)
           VALUES ($1,$2,$3,$4,$5,'application',$6,$7,false) RETURNING *`,
          [hatId, hat.user_id, applicantId, Number(hat.price_min), application.id, hat.currency || 'NGN', payUnit || null],
        )
        escrow = rows[0]
      }
      if (hasInitialProposal) {
        const proposalText = messageText(typeof proposal.proposalMessage === 'string' ? proposal.proposalMessage : '', escrow, false)
        await client.query(
          `INSERT INTO booking_messages
             (escrow_id, sender_id, recipient_id, kind, body, amount, currency, pay_unit, offer_status, client_token)
           VALUES ($1,$2,$3,'offer',$4,$5,$6,$7,'pending',$8)`,
          [escrow.id, applicantId, hat.user_id, proposalText, proposedAmount, hat.currency || 'NGN', payUnit || null, randomUUID()],
        )
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  if (!alreadyApplied) await notifyApplicationCreated(application.id)
  return { application, alreadyApplied, escrow }
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
              h.price_type, h.rate, h.rate_unit, h.rate_unit_custom, h.price_min, h.price_max, h.currency
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
          `SELECT * FROM escrows WHERE application_id = $1 FOR UPDATE`,
          [applicationId],
        )
        escrow = existing.rows[0] || null

        if (current.price_type === 'range') {
          if (!escrow) throw bookingError(409, 'Start negotiation before accepting this Range application.')
          const { rows: pending } = await client.query(
            `SELECT id FROM booking_messages WHERE escrow_id = $1 AND offer_status = 'pending'`,
            [escrow.id],
          )
          if (pending[0] || !escrow.agreed_at) {
            throw bookingError(409, 'Agree the Range price before accepting this application.')
          }
        }

        if (escrow) {
          if (escrow.status !== 'not_funded') throw bookingError(409, 'This deal is no longer awaiting acceptance.')
          if (!escrow.contacts_unlocked) {
            const unlocked = await client.query(
              `UPDATE escrows SET contacts_unlocked = true WHERE id = $1 RETURNING *`,
              [escrow.id],
            )
            escrow = unlocked.rows[0]
          }
        } else {
          const payUnit = current.rate_unit === 'custom' ? current.rate_unit_custom : current.rate_unit
          const created = await client.query(
            `INSERT INTO escrows
               (hat_id, client_id, talent_id, amount, contacts_unlocked, application_id, request_kind, currency, pay_unit, agreed_at)
             VALUES ($1,$2,$3,$4,true,$5,'application',$6,$7,NOW()) RETURNING *`,
            [hatId, ownerId, current.applicant_id, amount, applicationId, current.currency || 'NGN', payUnit || null],
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
      await client.query(
        `UPDATE escrows SET status = 'cancelled', contacts_unlocked = false
         WHERE application_id = $1 AND status = 'not_funded' AND contacts_unlocked = false`,
        [applicationId],
      )
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
        await client.query(
          `UPDATE escrows SET status = 'not_funded', contacts_unlocked = false
           WHERE application_id = $1 AND status = 'cancelled'`,
          [applicationId],
        )
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
