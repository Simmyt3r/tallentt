// Operational telemetry for Showroom media moderation. No provider keys,
// payloads or creator media are included in this audit trail.
import { query, getClient } from './db.js'

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const bad = (status, message) => Object.assign(new Error(message), { status })
let ready

export async function ensureScreeningOpsStorage() {
  if (!ready) ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS showroom_screening_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL CHECK (source IN ('admin','worker')),
      triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
      checked INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      held INTEGER NOT NULL DEFAULT 0,
      retried INTEGER NOT NULL DEFAULT 0,
      error_code TEXT
    )`)
    await query('CREATE INDEX IF NOT EXISTS idx_showroom_screening_runs_recent ON showroom_screening_runs (started_at DESC, id DESC)')
  })().catch(e => {ready=null; throw e})
  return ready
}

export async function startScreeningRun(source = 'worker', triggeredBy = null) {
  if (!['admin','worker'].includes(source)) throw bad(400, 'Invalid moderation run source.')
  await ensureScreeningOpsStorage()
  const { rows } = await query(
    'INSERT INTO showroom_screening_runs (source, triggered_by) VALUES ($1,$2) RETURNING id',
    [source, triggeredBy],
  )
  return rows[0].id
}

export async function finishScreeningRun(id, result, errorCode = null) {
  const {rowCount} = await query(
    `UPDATE showroom_screening_runs SET status = $2, finished_at = NOW(),
      checked = $3, passed = $4, held = $5, retried = $6, error_code = $7
     WHERE id = $1 AND status = 'running'`,
    [id, errorCode ? 'failed' : 'completed',
      result.checked || 0, result.passed || 0, result.held || 0, result.retried || 0,
      errorCode?.slice(0, 60) || null],
  )
  return rowCount === 1
}

export async function screeningOperationalStatus() {
  await ensureScreeningOpsStorage()
  const [counts, age, recent] = await Promise.all([
    query(`SELECT screening_status, COUNT(*)::int AS count FROM hat_media
            WHERE screening_status IN ('pending','processing','held','rejected')
            GROUP BY screening_status`),
    query(`SELECT COUNT(*)::int AS due FROM hat_media
            WHERE screening_status = 'pending' AND screening_retry_at <= NOW()`),
    query(`SELECT id, source, started_at, finished_at, status, checked,
                   passed, held, retried, error_code
            FROM showroom_screening_runs
            ORDER BY started_at DESC, id DESC LIMIT 8`),
  ])
  return {
    counts: Object.fromEntries(counts.rows.map(x => [x.screening_status, x.count])),
    due: age.rows[0]?.due || 0,
    runs: recent.rows,
  }
}

export async function retryHeldScreening(adminId, mediaId) {
  if (!UUID.test(String(mediaId || ''))) throw bad(400, 'Invalid media ID.')
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const {rows} = await client.query(
      `UPDATE hat_media SET screening_status = 'pending',
         screening_attempts = 0, screening_reason = 'admin_retry_requested',
         screening_retry_at = NOW(), screening_checked_at = NULL,
         screening_locked_at = NULL, screening_lock_token = NULL
       WHERE id = $1 AND screening_status = 'held'
         AND screening_reason = 'screening_unavailable'
       RETURNING hat_id`,[mediaId])
    if (!rows[0]) throw bad(409, 'Only held media from exhausted scanner retries can be retried.')
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id,action,target_type,target_id,metadata)
       VALUES ($1,'retry_showroom_media','hat',$2,$3::jsonb)`,
      [adminId,rows[0].hat_id,JSON.stringify({mediaId})],
    )
    await client.query('COMMIT')
    return {ok:true,mediaId}
  } catch (error) {await client.query('ROLLBACK').catch(() => {});throw error}
  finally {client.release()}
}
