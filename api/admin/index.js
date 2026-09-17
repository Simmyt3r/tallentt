// Path: api/admin/index.js
import { query, getClient } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody } from '../_lib/http.js'
import { bookingLifecycle, listDisputes, getDispute } from '../_lib/bookingLifecycle.js'
import {
  notifyApplicationStatus,
  notifyEscrowCancelled,
  notifyHatModeration,
  notifyWithdrawalStatusByTransaction,
} from '../_lib/notifications.js'

const DASHBOARD_LIMIT = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APP_STATUSES = new Set(['pending', 'accepted', 'rejected', 'withdrawn'])
const WITHDRAWAL_STATUSES = new Set(['pending', 'success', 'failed'])

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  const admin = await requireAdmin(req, res)
  if (!admin) return

  if (req.method === 'GET') {
    try {
      const params = new URL(req.url, `http://${req.headers.host}`).searchParams
      if (params.get('action') === 'disputes') return json(res, 200, await listDisputes(params.get('status') || 'open', params.get('before')))
      if (params.get('action') === 'dispute') return json(res, 200, await getDispute(params.get('escrow_id'), params.get('before'), params.get('events_before')))
      const dashboard = await getDashboard()
      return json(res, 200, { admin: { id: admin.id, username: admin.username }, ...dashboard })
    } catch (err) {
      if (!err.status) console.error('admin dashboard error:', err)
      return json(res, err.status || 500, { error: err.status ? err.message : 'Failed to load admin dashboard.' })
    }
  }

  if (req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return json(res, err.status || 400, { error: err.message || 'Invalid request body.' })
    }

    try {
      const result = await handleAdminAction(admin, body)
      return json(res, 200, result)
    } catch (err) {
      if (!err.status) console.error('admin action error:', err)
      return json(res, err.status || 500, { error: err.message || 'Admin action failed.' })
    }
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}

async function requireAdmin(req, res) {
  const session = getSessionUser(req)
  if (!session?.sub) {
    json(res, 401, { error: 'Unauthorized' })
    return null
  }

  const { rows } = await query(
    `SELECT id, username, email, is_admin FROM users WHERE id = $1`,
    [session.sub],
  )
  const admin = rows[0]
  if (!admin) {
    json(res, 401, { error: 'Unauthorized' })
    return null
  }
  if (!admin.is_admin) {
    json(res, 403, { error: 'Admin access required.' })
    return null
  }
  return admin
}

async function getDashboard() {
  const [
    metrics,
    applicationStatuses,
    escrowStatuses,
    walletSummary,
    users,
    hats,
    applications,
    escrows,
    walletTransactions,
    auditLogs,
  ] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) as users,
        (SELECT COUNT(*)::int FROM users WHERE is_admin = true) as admins,
        (SELECT COUNT(*)::int FROM hats) as hats,
        (SELECT COUNT(*)::int FROM hats WHERE active = true) as active_hats,
        (SELECT COUNT(*)::int FROM hats WHERE role = 'talent') as talent_hats,
        (SELECT COUNT(*)::int FROM hats WHERE role = 'client') as client_hats,
        (SELECT COUNT(*)::int FROM applications) as applications,
        (SELECT COUNT(*)::int FROM escrows) as escrows,
        (SELECT COUNT(*)::int FROM booking_disputes WHERE status = 'open') as open_disputes,
        (SELECT COALESCE(SUM(balance), 0)::int FROM wallets) as wallet_liability
    `),
    query(`SELECT status, COUNT(*)::int as count FROM applications GROUP BY status ORDER BY status`),
    query(`
      SELECT status, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::int as amount
      FROM escrows GROUP BY status ORDER BY status
    `),
    query(`
      SELECT type, status, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::int as amount
      FROM wallet_transactions GROUP BY type, status ORDER BY type, status
    `),
    query(
      `SELECT u.id, u.username, u.email, u.role, u.country, u.lga, u.is_admin, u.created_at,
              COALESCE(w.balance, 0)::int as wallet_balance,
              COUNT(h.id)::int as hats_count
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN hats h ON h.user_id = u.id
       GROUP BY u.id, w.balance
       ORDER BY u.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
    query(
      `SELECT h.id, h.hat_title, h.username, h.role, h.category, h.active, h.is_verified,
              h.likes, h.views, h.bookings, h.orbit_score, h.created_at,
              COUNT(m.id)::int as media_count
       FROM hats h
       LEFT JOIN hat_media m ON m.hat_id = h.id
       GROUP BY h.id
       ORDER BY h.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
    query(
      `SELECT a.id, a.status, a.message, a.created_at, a.updated_at,
              h.id as hat_id, h.hat_title, h.username as hat_owner_username,
              applicant.username as applicant_username
       FROM applications a
       JOIN hats h ON h.id = a.hat_id
       JOIN users applicant ON applicant.id = a.applicant_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
    query(
      `SELECT e.id, e.hat_id, e.amount, e.status, e.contacts_unlocked,
              e.payment_reference, e.checkout_locked_at, e.created_at, e.funded_at, e.released_at,
              h.hat_title,
              client.username as client_username,
              talent.username as talent_username
       FROM escrows e
       LEFT JOIN hats h ON h.id = e.hat_id
       LEFT JOIN users client ON client.id = e.client_id
       LEFT JOIN users talent ON talent.id = e.talent_id
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
    query(
      `SELECT wt.id, wt.user_id, u.username, wt.type, wt.amount, wt.balance_after,
              wt.status, wt.reference, wt.escrow_id, wt.created_at
       FROM wallet_transactions wt
       LEFT JOIN users u ON u.id = wt.user_id
       ORDER BY wt.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
    query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.metadata, l.created_at,
              u.username as admin_username
       FROM admin_audit_logs l
       LEFT JOIN users u ON u.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [DASHBOARD_LIMIT],
    ),
  ])

  return {
    metrics: metrics.rows[0],
    statusCounts: {
      applications: applicationStatuses.rows,
      escrows: escrowStatuses.rows,
      wallet: walletSummary.rows,
    },
    lists: {
      users: users.rows,
      hats: hats.rows,
      applications: applications.rows,
      escrows: escrows.rows,
      walletTransactions: walletTransactions.rows,
      auditLogs: auditLogs.rows,
    },
  }
}

async function handleAdminAction(admin, body) {
  const action = body?.action
  if (!action) throw httpError(400, 'Action is required.')
  if (['resolve_release', 'resolve_refund'].includes(action)) {
    return bookingLifecycle(admin.id, body.escrow_id, action, body, true)
  }

  if (action === 'set_hat_active') {
    const hatId = requireUuid(body.hatId, 'hatId')
    if (typeof body.active !== 'boolean') throw httpError(400, 'active must be true or false.')
    const active = body.active
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE hats SET active = $1 WHERE id = $2 RETURNING id, user_id, hat_title, active`,
        [active, hatId],
      )
      if (!rows[0]) throw httpError(404, 'Hat not found.')
      await logAdminAction(client, admin.id, action, 'hat', hatId, { active })
      const hat = rows[0]
      await client.query('COMMIT')
      await notifyHatModeration({ userId: hat.user_id, hatId: hat.id, hatTitle: hat.hat_title, active: hat.active })
      return { ok: true, hat }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  if (action === 'set_application_status') {
    const applicationId = requireUuid(body.applicationId, 'applicationId')
    const status = String(body.status || '')
    if (!APP_STATUSES.has(status)) throw httpError(400, 'Invalid application status.')
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, applicationId],
      )
      if (!rows[0]) throw httpError(404, 'Application not found.')
      await logAdminAction(client, admin.id, action, 'application', applicationId, { status })
      const application = rows[0]
      await client.query('COMMIT')
      await notifyApplicationStatus({ applicationId: application.id, status, actor: 'admin' })
      return { ok: true, application }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  if (action === 'cancel_unfunded_escrow') {
    const escrowId = requireUuid(body.escrowId, 'escrowId')
    const client = await getClient()
    let escrow
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE escrows SET status = 'cancelled'
         WHERE id = $1 AND status = 'not_funded' AND checkout_locked_at IS NULL
         RETURNING *`,
        [escrowId],
      )
      if (!rows[0]) throw httpError(409, 'Only unfunded bookings without a started checkout can be cancelled here. Reconcile outstanding payments first.')
      await logAdminAction(client, admin.id, action, 'escrow', escrowId, {})
      escrow = rows[0]
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
    await notifyEscrowCancelled(escrow.id)
    return { ok: true, escrow }
  }

  if (action === 'set_withdrawal_status') {
    const transactionId = requireUuid(body.transactionId, 'transactionId')
    const status = String(body.status || '')
    if (!WITHDRAWAL_STATUSES.has(status)) throw httpError(400, 'Invalid withdrawal status.')
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE wallet_transactions SET status = $1
         WHERE id = $2 AND type = 'withdrawal'
         RETURNING *`,
        [status, transactionId],
      )
      if (!rows[0]) throw httpError(404, 'Withdrawal transaction not found.')
      await logAdminAction(client, admin.id, action, 'wallet_transaction', transactionId, { status })
      const transaction = rows[0]
      await client.query('COMMIT')
      await notifyWithdrawalStatusByTransaction({ transactionId: transaction.id, status })
      return { ok: true, transaction }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  throw httpError(400, 'Unknown admin action.')
}

async function logAdminAction(client, adminId, action, targetType, targetId, metadata) {
  await client.query(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, targetType, targetId, JSON.stringify(metadata || {})],
  )
}

function requireUuid(value, name) {
  const clean = String(value || '').trim()
  if (!UUID_RE.test(clean)) throw httpError(400, `${name} must be a valid UUID.`)
  return clean
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}
