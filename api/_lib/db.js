import pg from 'pg'

const { Pool } = pg

// Serverless functions spin up per-request, so keep the pool tiny (Neon's
// pooled connection string already does the heavy pooling on their side).
// We cache the pool on `global` so warm invocations reuse it instead of
// opening a fresh connection every time.
let pool = global.__tworldPool

if (!pool) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables.')
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  global.__tworldPool = pool
}

export function query(text, params) {
  return pool.query(text, params)
}

// Checks out a dedicated client for multi-statement transactions (e.g.
// updating a user's username and cascading it to their hats atomically).
// Callers must always release() the client, even on error.
export function getClient() {
  return pool.connect()
}