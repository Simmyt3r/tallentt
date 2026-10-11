import { query, getClient } from './db.js'

const REASONS = new Set(['contact_bypass', 'spam', 'unsafe_content', 'impersonation', 'other'])
let ready = null

export function isShowroomReportReason(value) {
  return REASONS.has(value)
}

// Idempotent bootstrap, avoiding any local setup or manual approval of posts.
export async function ensureShowroomReportStorage() {
  if (ready) return ready
  ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS showroom_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
      reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK (reason IN ('contact_bypass','spam','unsafe_content','impersonation','other')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (hat_id, reporter_id)
    )`)
    await query('CREATE INDEX IF NOT EXISTS idx_showroom_reports_reporter ON showroom_reports (reporter_id, created_at DESC)')
    await query(`CREATE TABLE IF NOT EXISTS showroom_review_state (
      hat_id UUID PRIMARY KEY REFERENCES hats(id) ON DELETE CASCADE,
      report_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'clear'
        CHECK (status IN ('clear', 'flagged', 'dismissed', 'restricted')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
    )`)
    await query('CREATE INDEX IF NOT EXISTS idx_showroom_review_queue ON showroom_review_state (updated_at DESC) WHERE status = \'flagged\'')
  })().catch(error => {
    ready = null
    throw error
  })
  return ready
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

export async function reportShowroomHat(userId, hatId, reason) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(hatId || ''))) {
    throw httpError(400, 'Invalid Showroom listing.')
  }
  if (!isShowroomReportReason(reason)) throw httpError(400, 'Choose a valid reporting reason.')
  await ensureShowroomReportStorage()

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: target } = await client.query(
      `SELECT h.user_id, h.active, h.role,
              EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id = h.id) AS has_media
       FROM hats h WHERE h.id = $1 FOR UPDATE`, [hatId],
    )
    if (!target.length || !target[0].active || target[0].role !== 'talent' || !target[0].has_media) {
      throw httpError(404, 'Showroom listing not found.')
    }
    if (target[0].user_id === userId) throw httpError(403, 'You cannot report your own listing.')

    // Prevent one account from swamping the queue across thousands of listings.
    const { rows: quota } = await client.query(
      `SELECT COUNT(*)::int AS count FROM showroom_reports
       WHERE reporter_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`, [userId],
    )
    const { rows: existing } = await client.query(
      'SELECT id FROM showroom_reports WHERE hat_id = $1 AND reporter_id = $2', [hatId, userId],
    )
    if (existing.length) {
      await client.query('COMMIT')
      return { ok: true, alreadyReported: true }
    }
    if (quota[0].count >= 20) throw httpError(429, 'Daily report limit reached. Try again tomorrow.')

    await client.query(
      `INSERT INTO showroom_reports (hat_id, reporter_id, reason)
       VALUES ($1, $2, $3) ON CONFLICT (hat_id, reporter_id) DO NOTHING`,
      [hatId, userId, reason],
    )
    await client.query(
      `INSERT INTO showroom_review_state (hat_id, report_count, status)
       VALUES ($1, 1, 'clear')
       ON CONFLICT (hat_id) DO UPDATE SET
         report_count = showroom_review_state.report_count + 1,
         status = CASE WHEN showroom_review_state.status = 'restricted' THEN 'restricted'
             WHEN showroom_review_state.report_count + 1 >= 3 THEN 'flagged'
             ELSE showroom_review_state.status END,
         updated_at = NOW()`,
      [hatId],
    )
    await client.query('COMMIT')
    return { ok: true, alreadyReported: false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function getShowroomReviewQueue() {
  await ensureShowroomReportStorage()
  const { rows } = await query(
    `SELECT s.hat_id, s.report_count, s.updated_at, h.hat_title, h.category,
            h.active, h.user_id, u.full_name AS owner_full_name, u.username AS owner_username,
            COALESCE((SELECT m.url FROM hat_media m WHERE m.hat_id = h.id
                      ORDER BY m.created_at ASC LIMIT 1), '') AS cover_url,
            (SELECT jsonb_object_agg(reason, reason_count)
             FROM (SELECT reason, COUNT(*)::int AS reason_count
                   FROM showroom_reports r WHERE r.hat_id = s.hat_id
                   GROUP BY reason) grouped) AS reasons
     FROM showroom_review_state s
     JOIN hats h ON h.id = s.hat_id JOIN users u ON u.id = h.user_id
     WHERE s.status = 'flagged'
     ORDER BY s.updated_at ASC, s.hat_id
     LIMIT 40`,
  )
  const { rows: totals } = await query(
    "SELECT COUNT(*)::int AS flagged FROM showroom_review_state WHERE status = 'flagged'",
  )
  return { items: rows, flagged: totals[0]?.flagged || 0 }
}

export async function resolveShowroomReport(adminId, hatId, decision) {
  if (!['dismiss', 'restrict'].includes(decision)) throw httpError(400, 'Invalid decision.')
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(hatId || ''))) {
    throw httpError(400, 'Invalid Showroom listing.')
  }
  await ensureShowroomReportStorage()
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      "SELECT hat_id FROM showroom_review_state WHERE hat_id = $1 AND status = 'flagged' FOR UPDATE",
      [hatId],
    )
    if (!rows.length) throw httpError(409, 'This listing is no longer awaiting review.')
    if (decision === 'restrict') {
      await client.query('UPDATE hats SET active = false WHERE id = $1', [hatId])
    }
    await client.query(
      `UPDATE showroom_review_state
       SET status = $2, report_count = 0, reviewed_at = NOW(),
           reviewed_by = $3, updated_at = NOW()
       WHERE hat_id = $1`,
      [hatId, decision === 'restrict' ? 'restricted' : 'dismissed', adminId],
    )
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
       VALUES ($1, 'resolve_showroom_report', 'hat', $2, $3::jsonb)`,
      [adminId, hatId, JSON.stringify({ decision })],
    )
    await client.query('COMMIT')
    return { ok: true, decision, hatId }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
