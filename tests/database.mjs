import { randomBytes } from 'node:crypto'

export async function testDatabase() {
  if (process.env.TEST_DATABASE_URL) {
    const { default: pg } = await import('pg')
    const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
    const name = `chombutar_test_${randomBytes(8).toString('hex')}`
    await admin.query(`CREATE DATABASE ${name}`)
    const url = new URL(process.env.TEST_DATABASE_URL)
    url.pathname = `/${name}`
    const pool = new pg.Pool({ connectionString: url.toString(), max: 8 })
    return { pool, close: async () => {
      await pool.end()
      await admin.query(`DROP DATABASE ${name}`)
      await admin.end()
    } }
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto')
  const db = new PGlite({ extensions: { pgcrypto } })
  let tail = Promise.resolve()
  const pool = {
    // PGlite has one connection. Queue transactions, as the production pool does
    // at max:1; CI additionally exercises independent connections on PostgreSQL.
    async connect() {
      const previous = tail
      let release
      tail = new Promise((resolve) => { release = resolve })
      await previous
      return { query: async (sql, params) => {
        if (!params && sql.includes(';')) {
          const results = await db.exec(sql)
          return results.at(-1) || { rows: [] }
        }
        const result = await db.query(sql, params)
        return { ...result, rowCount: result.affectedRows }
      }, release }
    },
    async query(sql, params) {
      const client = await pool.connect()
      try { return await client.query(sql, params) }
      finally { client.release() }
    },
  }
  return { pool, close: () => db.close() }
}
