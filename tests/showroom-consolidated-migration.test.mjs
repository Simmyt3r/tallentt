import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

const sqlFile = new URL('../db/patch-showroom-production-2026-10.sql', import.meta.url)
const componentFiles = [
  'showroom-appeals.sql',
  'showroom-media-screening.sql',
  'showroom-admin-config.sql',
  'showroom-screening-ops.sql',
  'hat-media-signed-uploads.sql',
]

test('combined production patch retains the five individual migrations without drift', async () => {
  const combined = await readFile(sqlFile, 'utf8')
  for (const name of componentFiles) {
    const part = (await readFile(new URL('../db/' + name, import.meta.url), 'utf8')).trim()
    assert.ok(combined.includes(part), name + ' differs from the combined patch')
  }
  assert.match(combined, /BEGIN;/)
  assert.match(combined, /COMMIT;/)
  assert.doesNotMatch(combined, /^(?:DROP|TRUNCATE|DELETE|UPDATE)\s/mi,
    'the upgrade patch must not delete or rewrite existing records')
})

test('combined Showroom upgrade preserves old media, adds all structures, and can run twice', async () => {
  const db = await testDatabase()
  try {
    const { pool } = db
    // Minimal existing installation. This intentionally lacks every new
    // Showroom table/column, so we exercise the real upgrade, not just a re-run
    // over already upgraded db/schema.sql.
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE hats (id UUID PRIMARY KEY, user_id UUID REFERENCES users(id));
      CREATE TABLE hat_media (
        id UUID PRIMARY KEY, hat_id UUID REFERENCES hats(id),
        url TEXT NOT NULL, public_id TEXT NOT NULL,
        type TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE showroom_reports (id UUID PRIMARY KEY);
      CREATE TABLE showroom_review_state (id UUID PRIMARY KEY);
    `)
    const uid = randomUUID(), hid = randomUUID(), mid = randomUUID()
    await pool.query('INSERT INTO users(id) VALUES($1)', [uid])
    await pool.query('INSERT INTO hats(id,user_id) VALUES($1,$2)', [hid,uid])
    await pool.query(
      "INSERT INTO hat_media(id,hat_id,url,public_id,type) VALUES($1,$2,'https://example.test/legacy.jpg','legacy-asset','image')",
      [mid,hid],
    )

    const sql = await readFile(sqlFile, 'utf8')
    await pool.query(sql)
    const { rows: first } = await pool.query(
      'SELECT screening_status,screening_attempts,screening_reason FROM hat_media WHERE id=$1',[mid])
    assert.equal(first[0].screening_status,'legacy',
      'existing Showroom media must not be hidden by adding the patch')
    assert.equal(first[0].screening_attempts,0)
    assert.equal(first[0].screening_reason,null)
    for (const name of [
      'showroom_appeals','showroom_screening_config',
      'showroom_screening_runs','hat_media_upload_permits',
    ]) {
      assert.equal((await pool.query('SELECT to_regclass($1) AS table_name',[name])).rows[0].table_name, name)
    }
    const expectedIndexes = [
      'idx_showroom_appeal_pending','idx_showroom_appeals_queue','idx_showroom_appeals_owner',
      'idx_hat_media_screening_queue','idx_hat_media_screening_reviews','idx_hat_media_public_id',
      'idx_showroom_screening_runs_recent','idx_hat_media_permits_user',
      'idx_hat_media_permits_expiration',
    ]
    const { rows: indexes } = await pool.query(
      'SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname=ANY($1::text[])',
      [expectedIndexes],
    )
    assert.deepEqual(indexes.map(x=>x.indexname).sort(),expectedIndexes.slice().sort())

    // Re-running it must preserve existing media rows and claimed upload permits.
    const permit=randomUUID()
    await pool.query(`INSERT INTO hat_media_upload_permits
      (id,user_id,public_id,resource_type,declared_mime,declared_bytes,
       claimed_hat_id,claimed_at)
       VALUES($1,$2,'legacy-run-test','image','image/jpeg',1024,$3,NOW())`,
    [permit,uid,hid])
    await pool.query(sql)
    const {rows: media} = await pool.query('SELECT COUNT(*)::int AS total FROM hat_media')
    assert.equal(media[0].total,1)
    const {rows: claimed} = await pool.query(
      'SELECT claimed_hat_id,claimed_at FROM hat_media_upload_permits WHERE id=$1',[permit])
    assert.equal(claimed[0].claimed_hat_id,hid)
    assert.ok(claimed[0].claimed_at)
    const {rows: configs} = await pool.query('SELECT COUNT(*)::int AS total FROM showroom_screening_config')
    assert.equal(configs[0].total,0,'the migration must not turn on screening')
  } finally { await db.close() }
})

test('consolidated patch refuses an installation without the base Showroom schema', async () => {
  const db = await testDatabase()
  try {
    await db.pool.query('CREATE TABLE users (id UUID PRIMARY KEY)')
    await assert.rejects(
      db.pool.query(await readFile(sqlFile, 'utf8')),
      /Missing base chombuTar schema/,
    )
    const {rows}=await db.pool.query("SELECT to_regclass('showroom_appeals') AS t")
    assert.equal(rows[0].t,null,'the failure must roll back without partial changes')
  } finally { await db.close() }
})
