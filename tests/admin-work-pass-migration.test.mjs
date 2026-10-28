import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

// Exercise the actual Admin HTTP handler, not just catalog source matching.
const id='work-pass-2026-10'
const adminId=randomUUID(),regularId=randomUUID()
let database,pool,handler,signSession

before(async()=>{
  database=await testDatabase()
  pool=database.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='work-pass-admin-migrations-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [userId,username,isAdmin] of [
    [adminId,'workpassadmin',true],
    [regularId,'workpassregular',false],
  ]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'test-only',$4)`,[userId,username,username+'@example.test',isAdmin])
  }
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/admin/index.js')).default
})
after(async()=>{await database?.close();delete global.__tworldPool})

async function request({who=adminId,method='GET',body}={}){
  const stream=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(stream,{url:method==='GET'?'/api/admin?action=db_migrations':'/api/admin',method,
    headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const response={statusCode:200,headers:{},
    setHeader(name,value){this.headers[name]=value},
    end(text){this.body=JSON.parse(text)}}
  await handler(stream,response)
  return {status:response.statusCode,data:response.body}
}
async function getCatalog(){
  const response=await request()
  assert.equal(response.status,200,JSON.stringify(response.data))
  const migration=response.data.migrations.find(entry=>entry.id===id)
  assert.ok(migration,'Work Pass must appear in Admin migration list')
  return migration
}

test('Work Pass migration is discoverable but never available to non-admin users',async()=>{
  assert.equal((await request({who:null})).status,401)
  assert.equal((await request({who:regularId})).status,403)
  const item=await getCatalog()
  assert.equal(item.status,'pending')
  assert.match(item.checksum,/^[0-9a-f]{64}$/)
  assert.equal((await request({who:regularId,method:'POST',body:{
    action:'apply_db_migration',migrationId:id,checksum:item.checksum,confirm:'APPLY '+id,
  }})).status,403)
  assert.equal((await request({method:'POST',body:{
    action:'apply_db_migration',migrationId:id,checksum:item.checksum,confirm:'wrong',
  }})).status,400)
  assert.equal((await request({method:'POST',body:{
    action:'apply_db_migration',migrationId:id,checksum:'0'.repeat(64),confirm:'APPLY '+id,
  }})).status,409)
  assert.equal((await pool.query("SELECT to_regclass('work_pass_evidence') AS name")).rows[0].name,null)
})

test('Admin installs Work Pass tables transactionally and records checksum and identity',async()=>{
  const item=await getCatalog()
  const payload={action:'apply_db_migration',migrationId:id,checksum:item.checksum,confirm:'APPLY '+id}
  const result=await request({method:'POST',body:payload})
  assert.equal(result.status,200,JSON.stringify(result.data))
  assert.equal(result.data.status,'applied')
  assert.equal((await getCatalog()).status,'applied')
  for(const table of ['work_pass_evidence','work_pass_robots','work_pass_issuers','work_pass_endorsements']){
    const {rows}=await pool.query('SELECT to_regclass($1) AS name',[table])
    assert.ok(rows[0].name,'Missing Work Pass table: '+table)
  }
  const {rows:receipts}=await pool.query(`SELECT checksum,applied_by FROM chombutar_schema_migrations WHERE migration_id=$1`,[id])
  assert.equal(receipts.length,1)
  assert.equal(receipts[0].checksum,item.checksum)
  assert.equal(receipts[0].applied_by,adminId)
  const {rows:audit}=await pool.query(`SELECT COUNT(*)::int AS count FROM admin_audit_logs
    WHERE action='apply_db_migration' AND metadata->>'migrationId'=$1`,[id])
  assert.equal(audit[0].count,1)
  const repeat=await request({method:'POST',body:payload})
  assert.equal(repeat.status,200)
  assert.equal(repeat.data.status,'already_applied')
})

test('Robot registration begins unverified and enforces unique manufacturer serials',async()=>{
  const robot={owner:regularId,manufacturer:'Example Robotics',serial:'XR-101',name:'Care Assistant'}
  const insert=`INSERT INTO work_pass_robots(owner_id,manufacturer,serial_number,display_name)
    VALUES($1,$2,$3,$4) RETURNING manufacturer_verified`
  const args=[robot.owner,robot.manufacturer,robot.serial,robot.name]
  const {rows}=await pool.query(insert,args)
  assert.equal(rows[0].manufacturer_verified,false)
  await assert.rejects(pool.query(insert,args),error=>error.code==='23505')
})
