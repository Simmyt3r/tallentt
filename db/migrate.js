// Usage: DATABASE_URL=postgres://... node db/migrate.js
// (or `npm run db:migrate` if DATABASE_URL is already in your shell/.env)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const { Pool } = pg

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Put it in your shell env or a local .env you load first.')
    process.exit(1)
  }

  const file = process.argv.includes('--completion') ? 'booking-completion.sql' : 'schema.sql'
  const sql = readFileSync(join(__dirname, file), 'utf8')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await pool.query(sql)
    console.log(`✅ Migration applied: ${file}`)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
