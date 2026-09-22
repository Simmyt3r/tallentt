import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
const liveMigration = await readFile(new URL('../db/live-support.sql', import.meta.url), 'utf8')

test('Live migration is idempotent and replaces managed-provider columns with MediaMTX session fields', async () => {
  const database = await testDatabase()
  try {
    await database.pool.query(schema)
    await database.pool.query(liveMigration)
    await database.pool.query(liveMigration)

    const { rows: columns } = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='live_streams' ORDER BY column_name`,
    )
    const names = new Set(columns.map((row) => row.column_name))
    for (const required of ['stream_path', 'publish_token_hash', 'media_status', 'last_media_event_at']) {
      assert.equal(names.has(required), true, `missing ${required}`)
    }
    for (const obsolete of ['provider', 'provider_input_id', 'provider_status', 'playback_url', 'playback_dash_url']) {
      assert.equal(names.has(obsolete), false, `obsolete column remains: ${obsolete}`)
    }

    const { rows: gifts } = await database.pool.query(
      `SELECT id,name FROM live_gift_catalogue WHERE active=true ORDER BY sort_order`,
    )
    assert.deepEqual(gifts.map((row) => row.id), [
      'applause', 'encore', 'spotlight', 'creative-fuel', 'gear-boost',
      'production-boost', 'gig-support', 'studio-session', 'career-boost',
      'headliner', 'talent-sponsor',
    ])
  } finally {
    await database.close()
  }
})
