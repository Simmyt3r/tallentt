import { query } from './db.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value, max) {
  if (value == null) return null
  const clean = String(value).replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > max ? clean.slice(0, max - 1) + '...' : clean
}

function safeLink(value) {
  if (!value) return null
  const link = String(value).trim()
  if (!link.startsWith('/') || link.startsWith('//')) return null
  return link
}

function fmtMoney(amount) {
  const n = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `NGN ${Math.round(n).toLocaleString()}`
  }
}

function nameFrom(row, prefix, fallback = 'Someone') {
  const fullName = row?.[`${prefix}_full_name`]
  const username = row?.[`${prefix}_username`]
  // Same convention as the app's identity display (src/lib/profile.js): Talent
  // are `^username`, Clients are their plain username. Only a fallback — a name
  // is always preferred.
  const handle = username ? (prefix === 'client' ? username : `^${username}`) : null
  return fullName || handle || fallback
}

function titleForHat(hatTitle) {
  return hatTitle ? `"${hatTitle}"` : 'your hat'
}

function mapNotification(row) {
  return {
    ...row,
    unread: !row.read_at,
  }
}

export async function getNotificationInbox(userId) {
  const [items, count] = await Promise.all([
    query(
      `SELECT id, type, title, body, link_url, metadata, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    ),
    query(`SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]),
  ])

  return {
    notifications: items.rows.map(mapNotification),
    unreadCount: count.rows[0]?.count || 0,
  }
}

export async function markNotificationRead(userId, notificationId) {
  if (!UUID_RE.test(String(notificationId || '').trim())) return null
  const { rows } = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, body, link_url, metadata, read_at, created_at`,
    [notificationId, userId],
  )
  return rows[0] ? mapNotification(rows[0]) : null
}

export async function markAllNotificationsRead(userId) {
  const { rowCount } = await query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
  return rowCount || 0
}

export async function notifyUser({ userId, type = 'system', title, body = null, linkUrl = null, metadata = {} }) {
  if (!userId || !title) return null

  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, link_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, type, title, body, link_url, metadata, read_at, created_at`,
      [
        userId,
        cleanText(type, 60) || 'system',
        cleanText(title, 120),
        cleanText(body, 500),
        safeLink(linkUrl),
        JSON.stringify(metadata || {}),
      ],
    )
    return mapNotification(rows[0])
  } catch (err) {
    console.error('notification insert failed:', err)
    return null
  }
}

export async function notifyApplicationReceived({ ownerId, hatId, hatTitle, applicationId, applicantUsername, applicantName }) {
  return notifyUser({
    userId: ownerId,
    type: 'application_received',
    title: 'New application',
    body: `${applicantName || (applicantUsername ? `^${applicantUsername}` : 'Someone')} applied to ${titleForHat(hatTitle)}.`,
    linkUrl: '/deals?role=client&tab=incoming',
    metadata: { hat_id: hatId, application_id: applicationId },
  })
}

export async function notifyApplicationStatus({ applicationId, status, actor = 'owner' }) {
  try {
    const { rows } = await query(
      `SELECT a.id, a.status, a.applicant_id,
              h.id as hat_id, h.hat_title, h.user_id as owner_id, h.username as owner_username
       FROM applications a
       JOIN hats h ON h.id = a.hat_id
       WHERE a.id = $1`,
      [applicationId],
    )
    const app = rows[0]
    if (!app) return null

    const statusText = String(status || app.status)
    const applicantNotification = await notifyUser({
      userId: app.applicant_id,
      type: 'application_status',
      title: `Application ${statusText}`,
      body: `Your application to ${titleForHat(app.hat_title)} was marked ${statusText}.`,
      linkUrl: '/deals?role=talent&tab=outgoing',
      metadata: { application_id: app.id, hat_id: app.hat_id, status: statusText, actor },
    })

    if (actor === 'admin') {
      await notifyUser({
        userId: app.owner_id,
        type: 'admin_application_status',
        title: 'Application updated by admin',
        body: `An admin marked an application on ${titleForHat(app.hat_title)} as ${statusText}.`,
        linkUrl: '/my-hats',
        metadata: { application_id: app.id, hat_id: app.hat_id, status: statusText, actor },
      })
    }

    return applicantNotification
  } catch (err) {
    console.error('application notification failed:', err)
    return null
  }
}

export async function notifyEscrowSecured(escrowId) {
  try {
    const { rows } = await query(
      `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount,
              h.hat_title,
              client.username as client_username, client.full_name as client_full_name,
              talent.username as talent_username, talent.full_name as talent_full_name
       FROM escrows e
       LEFT JOIN hats h ON h.id = e.hat_id
       LEFT JOIN users client ON client.id = e.client_id
       LEFT JOIN users talent ON talent.id = e.talent_id
       WHERE e.id = $1`,
      [escrowId],
    )
    const escrow = rows[0]
    if (!escrow) return null
    const title = titleForHat(escrow.hat_title)
    const amount = fmtMoney(escrow.amount)
    const clientName = nameFrom(escrow, 'client', 'A client')
    const talentName = nameFrom(escrow, 'talent', 'the talent')

    await Promise.all([
      notifyUser({
        userId: escrow.talent_id,
        type: 'escrow_secured',
        title: 'Booking secured',
        body: `${clientName} secured ${title} for ${amount}.`,
        linkUrl: '/deals?role=talent&tab=active',
        metadata: { escrow_id: escrow.id, hat_id: escrow.hat_id },
      }),
      notifyUser({
        userId: escrow.client_id,
        type: 'escrow_secured',
        title: 'Booking secured',
        body: `Your booking with ${talentName} for ${title} is now secured.`,
        linkUrl: '/deals?role=client&tab=active',
        metadata: { escrow_id: escrow.id, hat_id: escrow.hat_id },
      }),
    ])
    return true
  } catch (err) {
    console.error('escrow secured notification failed:', err)
    return null
  }
}

export async function notifyEscrowReleased(escrowId) {
  try {
    const { rows } = await query(
      `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount,
              h.hat_title,
              client.username as client_username, client.full_name as client_full_name,
              talent.username as talent_username, talent.full_name as talent_full_name
       FROM escrows e
       LEFT JOIN hats h ON h.id = e.hat_id
       LEFT JOIN users client ON client.id = e.client_id
       LEFT JOIN users talent ON talent.id = e.talent_id
       WHERE e.id = $1`,
      [escrowId],
    )
    const escrow = rows[0]
    if (!escrow) return null
    const title = titleForHat(escrow.hat_title)
    const amount = fmtMoney(escrow.amount)
    const talentName = nameFrom(escrow, 'talent', 'the talent')

    await Promise.all([
      notifyUser({
        userId: escrow.talent_id,
        type: 'escrow_released',
        title: 'Payment released',
        body: `${amount} from ${title} has been added to your wallet.`,
        linkUrl: '/wallet',
        metadata: { escrow_id: escrow.id, hat_id: escrow.hat_id },
      }),
      notifyUser({
        userId: escrow.client_id,
        type: 'escrow_released',
        title: 'Booking payment released',
        body: `You released ${amount} to ${talentName} for ${title}.`,
        linkUrl: '/deals?role=client&tab=active',
        metadata: { escrow_id: escrow.id, hat_id: escrow.hat_id },
      }),
    ])
    return true
  } catch (err) {
    console.error('escrow release notification failed:', err)
    return null
  }
}

export async function notifyEscrowCancelled(escrowId) {
  try {
    const { rows } = await query(
      `SELECT e.id, e.hat_id, e.client_id, e.talent_id, e.amount, h.hat_title
       FROM escrows e
       LEFT JOIN hats h ON h.id = e.hat_id
       WHERE e.id = $1`,
      [escrowId],
    )
    const escrow = rows[0]
    if (!escrow) return null
    const payload = {
      type: 'escrow_cancelled',
      title: 'Booking cancelled',
      body: `An unfunded booking for ${titleForHat(escrow.hat_title)} was cancelled by admin.`,
      metadata: { escrow_id: escrow.id, hat_id: escrow.hat_id },
    }

    await Promise.all([
      notifyUser({ ...payload, userId: escrow.client_id, linkUrl: '/deals?role=client&tab=active' }),
      notifyUser({ ...payload, userId: escrow.talent_id, linkUrl: '/deals?role=talent&tab=active' }),
    ])
    return true
  } catch (err) {
    console.error('escrow cancellation notification failed:', err)
    return null
  }
}

export async function notifyWalletTopup({ userId, amount, balance }) {
  return notifyUser({
    userId,
    type: 'wallet_topup',
    title: 'Wallet topped up',
    body: `${fmtMoney(amount)} was added to your wallet. New balance: ${fmtMoney(balance)}.`,
    linkUrl: '/wallet',
    metadata: { amount, balance },
  })
}

export async function notifyWithdrawalStarted({ userId, amount, payoutStatus }) {
  return notifyUser({
    userId,
    type: 'withdrawal_started',
    title: payoutStatus === 'success' ? 'Withdrawal sent' : 'Withdrawal pending',
    body:
      payoutStatus === 'success'
        ? `${fmtMoney(amount)} was sent to your payout account.`
        : `${fmtMoney(amount)} is pending payout review in Paystack.`,
    linkUrl: '/wallet',
    metadata: { amount, status: payoutStatus },
  })
}

export async function notifyWithdrawalFailed({ userId, amount }) {
  return notifyUser({
    userId,
    type: 'withdrawal_failed',
    title: 'Withdrawal failed',
    body: `${fmtMoney(amount)} could not be sent and has been refunded to your wallet.`,
    linkUrl: '/wallet',
    metadata: { amount },
  })
}

export async function notifyWithdrawalStatusByTransaction({ transactionId, status }) {
  try {
    const { rows } = await query(
      `SELECT id, user_id, amount FROM wallet_transactions WHERE id = $1 AND type = 'withdrawal'`,
      [transactionId],
    )
    const transaction = rows[0]
    if (!transaction) return null
    return notifyUser({
      userId: transaction.user_id,
      type: 'withdrawal_status',
      title: `Withdrawal ${status}`,
      body: `Your ${fmtMoney(transaction.amount)} withdrawal was marked ${status}.`,
      linkUrl: '/wallet',
      metadata: { transaction_id: transaction.id, status },
    })
  } catch (err) {
    console.error('withdrawal status notification failed:', err)
    return null
  }
}

export async function notifyHatModeration({ userId, hatId, hatTitle, active }) {
  return notifyUser({
    userId,
    type: 'hat_moderation',
    title: active ? 'Hat restored' : 'Hat paused',
    body: `${titleForHat(hatTitle)} was ${active ? 'restored' : 'paused'} by admin.`,
    linkUrl: hatId ? `/talent/${hatId}` : '/my-hats',
    metadata: { hat_id: hatId, active },
  })
}