// In-app, allowlisted database migrations for the authenticated Admin screen.
// SQL is loaded ONLY from known files bundled with the deployment. Never
// accept SQL text, file paths or migration URLs from a browser request.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { query, getClient } from './db.js'

const bad = (status, message) => Object.assign(new Error(message), { status })

export const MIGRATION_CATALOG = Object.freeze([
  {id:'monetization-2026-10',title:'Marketplace commissions, salary tracking & subscriptions',description:'Grandfathers earlier deals; adds 5% commission receipts, salary tracking charges, subscription price setup, and manual-review business verification. Apply before using billing.',path:new URL('../../db/patch-monetization-2026-10.sql',import.meta.url)},
  {id:'reputation-2026-10',title:'Lifetime reputation and completed-work reviews',description:'Apply after employment. Starts future-event scoring; no historical points are invented.',path:new URL('../../db/patch-reputation-2026-10.sql',import.meta.url)},
  {
    id: 'employment-2026-10',
    title: 'Full-time agreements and salary confirmation',
    description: 'Adds private employment terms, salary reports, confirmation history and inbox conversations. No fees or reputation changes.',
    path: new URL('../../db/patch-employment-2026-10.sql', import.meta.url),
  },
  {
    id: 'talent-card-2026-10',
    title: 'Talent Card preferences and featured portfolio',
    description: 'Adds main talent, work preferences and private salary expectations. Apply before deploying Talent Card editing.',
    path: new URL('../../db/patch-talent-card-2026-10.sql', import.meta.url),
  },
  {
    id: 'messaging-2026-10',
    title: 'Unified messaging replies and read receipts',
    description: 'Apply after General subscriber chats. Adds quoted replies and Associate read receipts before deploying the unified inbox.',
    path: new URL('../../db/patch-messaging-2026-10.sql', import.meta.url),
  },
  {
    id: 'associates-2026-10',
    title: 'Associates and Subscribers',
    description: 'Mutual professional Associates, vouches, one-way subscribers, and request privacy.',
    path: new URL('../../db/patch-associates-2026-10.sql', import.meta.url),
    id: 'notification-priorities-2026-10',
    title: 'Notification priorities and daily digests',
    description: 'Protected Bento/Money alerts, Associate controls, and idempotent Fame digest delivery.',
    path: new URL('../../db/patch-notification-priorities-2026-10.sql', import.meta.url),
  },
  {
    id: 'push-defaults-2026-10',
    title: 'All push categories selected by default',
    description: 'Sets the future marketing preference column default to true; preserves every existing subscriber choice.',
    path: new URL('../../db/patch-push-defaults-2026-10.sql', import.meta.url),
  },
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
    id: 'showroom-gallery-2026-10',
    title: 'Independent Showroom gallery',
    description: 'Non-commercial photo and video posts, moderation, owner deletion and engagement.',
    path: new URL('../../db/patch-showroom-gallery-2026-10.sql', import.meta.url),
  },
  {
    id: 'live-stage-competitions-2026-10',
    title: 'Live Stage competitions',
    description: 'Stage competition rooms, video entrants, viewer voting and lifecycle management.',
    path: new URL('../../db/patch-live-stage-competitions-2026-10.sql', import.meta.url),
  },
  {
    id: 'community-chats-2026-10',
    title: 'General subscriber chats',
    description: 'Consent-based messaging inbox distinct from deal negotiation and payment conversations.',
    path: new URL('../../db/patch-community-chats-2026-10.sql',import.meta.url),
  },
  {
    id: 'deal-calls-2026-10',
    title: 'Deals Chat audio and video calls',
    description: 'Encrypted peer-to-peer call signaling for funded, active deals.',
    path: new URL('../../db/patch-deal-calls-2026-10.sql', import.meta.url),
  },
  {
    id: 'orbit-review-2026-10',
    title: 'Orbit Score and Hat data review',
    description: 'Admin-configured activity weights, audit-ready Hat data review and improvement notes.',
    path: new URL('../../db/patch-orbit-review-2026-10.sql', import.meta.url),
  },
  {
    id: 'admin-user-erasure-2026-10',
    title: 'Admin account deletion & media cleanup',
    description: 'Enable safeguarded subscriber erasure, minimal audit records and retryable Cloudinary cleanup.',
    path: new URL('../../db/patch-admin-user-erasure-2026-10.sql', import.meta.url),
  },
  {
    id:'vibes-report-resolution-2026-10',
    title:'Vibes report resolution audit',
    description:'Keep subscriber reports and administrator case outcomes instead of deleting evidence.',
    path:new URL('../../db/patch-vibes-report-resolution-2026-10.sql',import.meta.url),
  },
  {
    id:'vibes-media-capacity-2026-10',
    title:'Vibes flexible media galleries',
    description:'Up to ten signed media attachments per post, subject to aggregate byte and rate limits.',
    path:new URL('../../db/patch-vibes-media-capacity-2026-10.sql',import.meta.url),
  },
  {
    id:'vibes-video-2026-10',
    title:'Vibes automatically screened video media',
    description:'Signed videos up to 20MB; cleared uploads publish automatically and suspicious media enters review.',
    path:new URL('../../db/patch-vibes-video-2026-10.sql',import.meta.url),
  },
  {
    id:'online-presence-2026-10',
    title:'Online presence indicator',
    description:'Adds recent heartbeat online presence with an optional visibility preference.',
    path:new URL('../../db/patch-online-presence-2026-10.sql',import.meta.url),
  },
  {
    id:'vibes-editor-2026-10',
    title:'Vibes longer posts and editing',
    description:'Adds 10,000-character post/reply capacity and edit history timestamps.',
    path:new URL('../../db/patch-vibes-editor-2026-10.sql',import.meta.url),
  },
  {
    id: 'card-detail-2026-10',
    title: 'Card profile statement and Hat requirements',
    description: 'Adds long-form professional profile statements and per-Hat requirements without changing tagline data.',
    path: new URL('../../db/patch-card-detail-2026-10.sql', import.meta.url),
  },
  {
    id: 'work-pass-2026-10',
    title: 'Work Pass identity, proof & robot registry',
    description: 'Customer-approved completed-job photos, robot ownership and vetted issuer/endorsement tables. QR signing requires separate server configuration.',
    path: new URL('../../db/patch-work-pass-2026-10.sql', import.meta.url),
  },
  {
    id: 'work-pass-signing-2026-10',
    title: 'Work Pass signing key storage',
    description: 'Server-side encrypted signing key storage and safe key rotation. Admin can activate signing without uploading secrets.',
    path: new URL('../../db/patch-work-pass-signing-2026-10.sql', import.meta.url),
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
