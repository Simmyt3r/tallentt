import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

let db, pool, handler, signSession
const adminId=randomUUID(),userId=randomUUID()
const migrationId='bento-inbox-2026-10'
const secondId='vibes-2026-10'

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='admin-db-migrations-regression-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [id,name,admin] of [[adminId,'migrationadmin',true],[userId,'regularuser',false]]){
    await pool.query("INSERT INTO users(id,username,full_name,email,password_hash,is_admin) VALUES($1,$2,$2,$3,'x',$4)",
      [id,name,name+'@example.test',admin])
  }
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/admin/index.js')).default
})
after(async()=>{await db?.close();delete global.__tworldPool})

async function request({who=adminId,method='GET',action='db_migrations',migrationId:mid,
  checksum,confirm}={}){
  const body=method==='POST'?{action,migrationId:mid,checksum,confirm}:null
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{url:method==='GET'?'/api/admin?action='+action:'/api/admin',
    method,headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(v){this.body=JSON.parse(v)}}
  await handler(req,res)
  return {status:res.statusCode,...res}
}
async function statusOf(id){
  const r=await request()
  assert.equal(r.status,200,JSON.stringify(r.body))
  return r.body.migrations.find(x=>x.id===id)
}

test('only database-verified admins can view or execute approved migrations',async()=>{
  assert.equal((await request({who:null})).status,401)
  assert.equal((await request({who:userId})).status,403)
  assert.equal((await request({who:null,method:'POST',action:'apply_db_migration'})).status,401)
  assert.equal((await request({who:userId,method:'POST',action:'apply_db_migration'})).status,403)
  const current=await statusOf(migrationId)
  assert.equal(current.status,'pending')
  assert.match(current.checksum,/^[0-9a-f]{64}$/)
  assert.equal((await request({method:'POST',action:'apply_db_migration',
    migrationId:'../../db/schema.sql',checksum:current.checksum,confirm:'APPLY ../../db/schema.sql'})).status,400)
  assert.equal((await request({method:'POST',action:'apply_db_migration',
    migrationId,checksum:current.checksum,confirm:'wrong'})).status,400)
  assert.equal((await request({method:'POST',action:'apply_db_migration',
    migrationId,checksum:'0'.repeat(64),confirm:'APPLY '+migrationId})).status,409)
  assert.equal((await pool.query("SELECT to_regclass('chombutar_schema_migrations') AS table_name")).rows[0].table_name,null)
})

test('migration runs transactionally once and records admin and source checksum',async()=>{
  const item=await statusOf(migrationId)
  const payload={method:'POST',action:'apply_db_migration',migrationId,
    checksum:item.checksum,confirm:'APPLY '+migrationId}
  const applied=await request(payload)
  assert.equal(applied.status,200,JSON.stringify(applied.body))
  assert.equal(applied.body.status,'applied')
  const twice=await request(payload)
  assert.equal(twice.status,200)
  assert.equal(twice.body.status,'already_applied')
  assert.equal((await statusOf(migrationId)).status,'applied')
  const {rows}=await pool.query('SELECT migration_id,checksum,applied_by FROM chombutar_schema_migrations WHERE migration_id=$1',[migrationId])
  assert.equal(rows[0].checksum,item.checksum)
  assert.equal(rows[0].applied_by,adminId)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='apply_db_migration' AND metadata->>'migrationId'=$1",[migrationId])).rows[0].n,1)
})

test('catalog detects altered migration records and will not rerun changed SQL',async()=>{
  await pool.query("UPDATE chombutar_schema_migrations SET checksum='tampered' WHERE migration_id=$1",[migrationId])
  const item=await statusOf(migrationId)
  assert.equal(item.status,'changed')
  const refused=await request({method:'POST',action:'apply_db_migration',
    migrationId,checksum:item.checksum,confirm:'APPLY '+migrationId})
  assert.equal(refused.status,409)
  await pool.query('UPDATE chombutar_schema_migrations SET checksum=$2 WHERE migration_id=$1',[migrationId,item.checksum])
})

test('Vibes migration creates its structures and has its own independent history',async()=>{
  const item=await statusOf(secondId)
  assert.equal(item.status,'pending')
  const applied=await request({method:'POST',action:'apply_db_migration',
    migrationId:secondId,checksum:item.checksum,confirm:'APPLY '+secondId})
  assert.equal(applied.status,200,JSON.stringify(applied.body))
  assert.equal((await statusOf(secondId)).status,'applied')
  assert.ok((await pool.query("SELECT to_regclass('vibes_posts') AS table_name")).rows[0].table_name)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM chombutar_schema_migrations')).rows[0].n,2)
})

test('a conflicting transaction-level migration lock returns 409 without side effects', {
  skip: !process.env.TEST_DATABASE_URL && 'Requires independent PostgreSQL connections',
},async()=>{
  const guard=await pool.connect()
  try {
    await guard.query('BEGIN')
    await guard.query('SELECT pg_advisory_xact_lock(154715,202610)')
    // Already-applied runs also acquire the advisory lock before checking
    // history, to serialize replays with new migrations.
    const item=await statusOf(migrationId)
    const conflict=await request({method:'POST',action:'apply_db_migration',
      migrationId,checksum:item.checksum,confirm:'APPLY '+migrationId})
    assert.equal(conflict.status,409,JSON.stringify(conflict.body))
    assert.match(conflict.body.error,/already running/i)
  } finally {await guard.query('ROLLBACK');guard.release()}
})
