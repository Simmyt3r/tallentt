import { getClient, query } from './db.js'
import { ensureShowroomReportStorage } from './showroomReports.js'
import { showroomTextIssue } from './showroomEligibility.js'

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const fail = (status, message) => Object.assign(new Error(message), { status })
let ready

export async function ensureShowroomAppealsStorage() {
  if (!ready) ready = (async () => {
    await ensureShowroomReportStorage()
    await query(`CREATE TABLE IF NOT EXISTS showroom_appeals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hat_id UUID NOT NULL REFERENCES hats(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 15 AND 1000),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT
    )`)
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_showroom_appeal_pending ON showroom_appeals (hat_id) WHERE status = 'pending'")
    await query("CREATE INDEX IF NOT EXISTS idx_showroom_appeals_queue ON showroom_appeals (created_at, id) WHERE status = 'pending'")
    await query('CREATE INDEX IF NOT EXISTS idx_showroom_appeals_owner ON showroom_appeals (user_id, created_at DESC)')
  })().catch(error => { ready = null; throw error })
  return ready
}

// The owner can see why a listing is missing without exposing reporter identities.
export async function myShowroomModeration(userId) {
  await ensureShowroomAppealsStorage()
  const { rows } = await query(
    `SELECT h.id AS hat_id, h.hat_title, s.status AS moderation_status,
            a.id AS appeal_id, a.status AS appeal_status, a.created_at AS appeal_created_at,
            a.resolution_note
     FROM hats h JOIN showroom_review_state s ON s.hat_id = h.id
     LEFT JOIN LATERAL (
       SELECT id, status, created_at, resolution_note FROM showroom_appeals
       WHERE hat_id = h.id ORDER BY created_at DESC, id DESC LIMIT 1
     ) a ON true
     WHERE h.user_id = $1 AND s.status IN ('flagged', 'restricted')
     ORDER BY s.updated_at DESC LIMIT 50`, [userId],
  )
  return { items: rows }
}

export async function submitShowroomAppeal(userId, hatId, explanation) {
  if (!UUID.test(String(hatId || ''))) throw fail(400, 'Invalid Showroom listing.')
  const message = String(explanation || '').trim()
  if (message.length < 15 || message.length > 1000) throw fail(400, 'Explain your appeal in 15 to 1000 characters.')
  await ensureShowroomAppealsStorage()
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows: hats } = await client.query(
      `SELECT h.id FROM hats h JOIN showroom_review_state s ON s.hat_id = h.id
       WHERE h.id = $1 AND h.user_id = $2 AND s.status = 'restricted' FOR UPDATE OF h`,
      [hatId, userId],
    )
    if (!hats.length) throw fail(404, 'No restricted listing eligible for appeal was found.')
    const { rows: previous } = await client.query(
      'SELECT status, created_at FROM showroom_appeals WHERE hat_id = $1 ORDER BY created_at DESC LIMIT 1', [hatId],
    )
    if (previous[0]?.status === 'pending') throw fail(409, 'An appeal is already pending.')
    if (previous[0]?.status === 'denied' && new Date(previous[0].created_at).getTime() > Date.now() - 7 * 86400000) {
      throw fail(429, 'You may appeal this listing again after seven days.')
    }
    const { rows } = await client.query(
      `INSERT INTO showroom_appeals (hat_id, user_id, explanation) VALUES ($1,$2,$3)
       RETURNING id, status, created_at`, [hatId, userId, message],
    )
    await client.query('COMMIT')
    return { ok: true, appeal: rows[0] }
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err }
  finally { client.release() }
}

export async function showroomAppealsQueue() {
  await ensureShowroomAppealsStorage()
  const { rows } = await query(
    `SELECT a.id, a.hat_id, a.explanation, a.created_at, h.hat_title, h.category,
            u.username AS owner_username, s.status AS moderation_status
     FROM showroom_appeals a JOIN hats h ON h.id = a.hat_id
     JOIN users u ON u.id = a.user_id JOIN showroom_review_state s ON s.hat_id = a.hat_id
     WHERE a.status = 'pending' ORDER BY a.created_at, a.id LIMIT 40`,
  )
  const { rows: counts } = await query("SELECT COUNT(*)::int AS pending FROM showroom_appeals WHERE status = 'pending'")
  return { items: rows, pending: counts[0]?.pending || 0 }
}

export async function resolveShowroomAppeal(adminId, appealId, decision, note) {
  if (!UUID.test(String(appealId || ''))) throw fail(400, 'Invalid appeal.')
  if (!['approve','deny'].includes(decision)) throw fail(400, 'Invalid decision.')
  const resolutionNote = String(note || '').trim().slice(0,1000)
  await ensureShowroomAppealsStorage()
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT a.hat_id, a.user_id, h.hat_title, h.hat_name, h.motto
       FROM showroom_appeals a JOIN hats h ON h.id = a.hat_id
       WHERE a.id = $1 AND a.status = 'pending' FOR UPDATE OF a,h`, [appealId],
    )
    const hat = rows[0]
    if (!hat) throw fail(409, 'This appeal has already been resolved.')
    if (decision === 'approve') {
      const { rows: media } = await client.query('SELECT caption FROM hat_media WHERE hat_id = $1', [hat.hat_id])
      if (showroomTextIssue({ title: [hat.hat_title, hat.hat_name].join(' '), motto: hat.motto, media })) {
        throw fail(409, 'The listing still contains off-platform contact text. The owner must remove it first.')
      }
      const { rows: state } = await client.query(
        `UPDATE showroom_review_state SET status = 'dismissed', report_count = 0,
         updated_at = NOW(), reviewed_at = NOW(), reviewed_by = $2
         WHERE hat_id = $1 AND status = 'restricted' RETURNING hat_id`, [hat.hat_id, adminId],
      )
      if (!state.length) throw fail(409, 'This listing is no longer restricted.')
      await client.query('UPDATE hats SET active = true WHERE id = $1', [hat.hat_id])
    }
    await client.query(
      `UPDATE showroom_appeals SET status = $2, reviewed_at = NOW(), reviewed_by = $3,
       resolution_note = $4 WHERE id = $1`,
      [appealId, decision === 'approve' ? 'approved' : 'denied', adminId, resolutionNote || null],
    )
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
       VALUES ($1,'resolve_showroom_appeal','hat',$2,$3::jsonb)`,
      [adminId, hat.hat_id, JSON.stringify({ appealId, decision, note: resolutionNote })],
    )
    await client.query('COMMIT')
    return { ok:true, hatId:hat.hat_id, userId:hat.user_id, hatTitle:hat.hat_title, decision }
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err }
  finally { client.release() }
}
