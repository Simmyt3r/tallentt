// In-app, allowlisted database migrations for the authenticated Admin screen.
// SQL is loaded ONLY from known files bundled with the deployment. Never
// accept SQL text, file paths or migration URLs from a browser request.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { query, getClient } from './db.js'

const bad = (status, message) => Object.assign(new Error(message), { status })

export const MIGRATION_CATALOG = Object.freeze([
  {
    id: 'bento-inbox-2026-10',
    title: 'Bento fliers and inbox management',
    description: 'Bento card artwork, private notification deletion and chat visibility.',
    path: new URL('../../db/patch-bento-inbox-2026-10.sql', import.meta.url),
  },
  {
    id: 'bento-no-accent-2026-10',
    title: 'No-accent Bento option',
    description: 'Apply after Bento fliers. Allow neutral colour bands during card customization.',
    path: new URL('../../db/patch-bento-no-accent-2026-10.sql', import.meta.url),
  },
  {
    id: 'vibes-2026-10',
    title: 'Hits & Vibes social feed',
    description: 'Community posts, likes, replies, reports and signed media permits.',
    path: new URL('../../db/patch-vibes-2026-10.sql', import.meta.url),
  },
  {
    id: 'showroom-owner-removal-2026-10',
    title: 'Showroom owner removal',
    description: 'Owners may hide or restore Showroom entries without deleting Hats and deals.',
    path: new URL('../../db/patch-showroom-owner-removal-2026-10.sql', import.meta.url),
  },
  {
    id: 'password-recovery-2026-10',
    title: 'Password recovery',
    description: 'One-use expiring reset tokens and request throttling.',
    path: new URL('../../db/patch-password-recovery-2026-10.sql', import.meta.url),
  },
])

const checksum = sql => createHash('sha256').update(sql).digest('hex')
const publicDetails = migration => ({
  id: migration.id, title: migration.title, description: migration.description,
})

async function bundledSql(migration) {
  try {
    const sql = await readFile(migration.path, 'utf8')
    // Current allowlisted patches wrap the contents in BEGIN / COMMIT.
    // Strip these and let our single connection own the transaction,
    // lock, migration history and Admin audit atomically.
    if (!/^\s*(?:--[^\n]*\n\s*)*BEGIN\s*;/i.test(sql) || !/COMMIT\s*;\s*$/i.test(sql)) {
      throw bad(503, 'The bundled migration has an unsupported transaction format.')
    }
    const statements = sql.replace(/\bBEGIN\s*;/i, '').replace(/COMMIT\s*;\s*$/i, '').trim()
    if (!statements) throw bad(503, 'The bundled migration is empty.')
    return { sql: statements, checksum: checksum(sql) }
  } catch (error) {
    if (error.status) throw error
    console.error('Migration asset unavailable:', migration.id, error.code || error.message)
    throw bad(503, 'This deployment does not include the selected migration. Redeploy the application.')
  }
}

async function storedMigrations() {
  const { rows: installed } = await query("SELECT to_regclass('chombutar_schema_migrations') AS registry")
  if (!installed[0]?.registry) return new Map()
  const { rows } = await query('SELECT migration_id, checksum, applied_at, applied_by FROM chombutar_schema_migrations')
  return new Map(rows.map(item => [item.migration_id, item]))
}

export async function adminMigrationStatus() {
  const [stored, files, database] = await Promise.all([
    storedMigrations(), Promise.all(MIGRATION_CATALOG.map(bundledSql)),
    query('SELECT current_database() AS name'),
  ])
  const migrations = MIGRATION_CATALOG.map((item, index) => {
    const previous = stored.get(item.id)
    const hash = files[index].checksum
    return {
      ...publicDetails(item), checksum: hash,
      status: previous ? previous.checksum === hash ? 'applied' : 'changed' : 'pending',
      appliedAt: previous?.applied_at || null,
      appliedBy: previous?.applied_by || null,
    }
  })
  return { databaseName: database.rows[0]?.name || '', migrations,
    pendingCount: migrations.filter(x => x.status === 'pending').length }
}

export async function applyAdminMigration(adminId, { migrationId, confirm, checksum: expectedChecksum } = {}) {
  const migration = MIGRATION_CATALOG.find(x => x.id === migrationId)
  if (!migration) throw bad(400, 'Select a migration listed in the Admin panel.')
  if (confirm !== `APPLY ${migrationId}`) throw bad(400, 'Confirm the exact migration before applying it.')
  const file = await bundledSql(migration)
  if (expectedChecksum !== file.checksum) throw bad(409, 'The migration changed since you reviewed it. Refresh the list.')

  const client = await getClient()
  let began = false
  try {
    await client.query('BEGIN')
    began = true
    // Avoid accidentally blocking the database for a long period, or holding
    // a Vercel function open indefinitely. The lock is released on commit.
    await client.query("SET LOCAL lock_timeout = '2500ms'")
    await client.query("SET LOCAL statement_timeout = '25000ms'")
    const { rows: lock } = await client.query(
      'SELECT pg_try_advisory_xact_lock(154715, 202610) AS acquired',
    )
    if (!lock[0]?.acquired) throw bad(409, 'Another database migration is already running.')
    await client.query(`CREATE TABLE IF NOT EXISTS chombutar_schema_migrations (
      migration_id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by UUID REFERENCES users(id) ON DELETE SET NULL
    )`)
    const { rows: tracked } = await client.query(
      'SELECT checksum FROM chombutar_schema_migrations WHERE migration_id=$1 FOR UPDATE',
      [migration.id],
    )
    if (tracked.length) {
      if (tracked[0].checksum !== file.checksum)
        throw bad(409, 'This migration was already recorded with different SQL. Investigate before proceeding.')
      await client.query('COMMIT')
      began = false
      return { status: 'already_applied', migrationId: migration.id }
    }

    const started = Date.now()
    // A single trusted SQL batch runs inside the SAME transaction as audit
    // and history, ensuring failed patches cannot become marked "applied".
    await client.query(file.sql)
    await client.query(`INSERT INTO chombutar_schema_migrations
      (migration_id, checksum, applied_by) VALUES ($1,$2,$3)`,
      [migration.id, file.checksum, adminId])
    await client.query(`INSERT INTO admin_audit_logs
      (admin_id, action, target_type, metadata)
      VALUES ($1,'apply_db_migration','db_migration',$2::jsonb)`,
      [adminId, JSON.stringify({migrationId: migration.id, checksum: file.checksum})])
    await client.query('COMMIT')
    began = false
    return { status: 'applied', migrationId: migration.id, durationMs: Date.now() - started }
  } catch(error) {
    if (began) await client.query('ROLLBACK').catch(() => {})
    // Failed attempts are noted separately after rollback; successful
    // migration-history entries and their audits are always atomic.
    await query(`INSERT INTO admin_audit_logs (admin_id, action, target_type, metadata)
      VALUES ($1,'apply_db_migration_failed','db_migration',$2::jsonb)`,
      [adminId, JSON.stringify({migrationId: migration.id, reason: error.status ? 'rejected' : 'sql_error'})]
    ).catch(auditError => console.error('Migration failure audit unavailable:', auditError.code || auditError.message))
    // Do not expose raw SQL/database errors to the browser.
    if (!error.status) {
      console.error('Admin migration failed:', migration.id, error.code || error.message)
      throw bad(500, 'Migration failed and was rolled back. Review server logs and database permissions.')
    }
    throw error
  } finally {
    client.release()
  }
}
