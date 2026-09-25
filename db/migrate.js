// Usage: DATABASE_URL=postgres://... node db/migrate.js
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

  const files = process.argv.includes('--hat-feed')
    ? ['hat-feed-visibility.sql']
    : process.argv.includes('--qr-settlement')
      ? ['booking-qr-settlement.sql']
    : process.argv.includes('--completion')
    ? ['booking-completion.sql']
    : process.argv.includes('--live')
      ? ['live-support.sql']
      : process.argv.includes('--hat-days')
        ? ['hat-availability-days.sql']
        : process.argv.includes('--hat-form')
          ? ['hat-availability-days.sql', 'hat-hiring-duration.sql']
          : process.argv.includes('--deals-runtime')
            ? ['patch-deals-runtime-v1.sql']
            : ['schema.sql', 'live-support.sql']

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    for (const file of files) {
      const sql = readFileSync(join(__dirname, file), 'utf8')
      await pool.query(sql)
      console.log(`✅ Migration applied: ${file}`)
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
