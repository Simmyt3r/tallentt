import test,{ before,after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createPublicKey, verify as verifySignature } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

const adminId=randomUUID(),viewerId=randomUUID()
let database,pool,handler,signSession
let first,second
before(async()=>{
  database=await testDatabase()
  pool=database.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='work-pass-admin-key-security-2026-a-stable-test-secret'
  delete process.env.WORK_PASS_SIGNING_PRIVATE_KEY
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  for(const [id,name,isAdmin] of [[adminId,'workpasskeyadmin',true],[viewerId,'workpasskeyviewer',false]]){
    await pool.query(`INSERT INTO users (id,username,full_name,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'irrelevant-test-hash',$4)`,[id,name,name+'@example.test',isAdmin])
  }
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/admin/index.js')).default
})
after(async()=>{await database?.close();delete global.__tworldPool})

async function adminRequest({who=adminId,method='GET',action='work_pass_signing',body}={}){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{method,url:method==='GET'?'/api/admin?action='+action:'/api/admin',
    headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(data){this.body=JSON.parse(data)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body}
}
function validateToken(token,publicKey){
  const parts=token.split('.')
  assert.equal(parts.length,4)
  assert.equal(parts[0],'CTWP1')
  assert.equal(parts[1],publicKey.keyId)
  const raw=Buffer.from(parts.slice(0,3).join('.'))
  return verifySignature('sha256',raw,{key:createPublicKey({key:publicKey.jwk,format:'jwk'}),
    dsaEncoding:'ieee-p1363'},Buffer.from(parts[3],'base64url'))
}

test('only Admin may inspect or create encrypted Work Pass signing keys',async()=>{
  assert.equal((await adminRequest({who:null})).status,401)
  assert.equal((await adminRequest({who:viewerId})).status,403)
  assert.equal((await adminRequest({who:null,method:'POST',body:{action:'activate_work_pass_signing'}})).status,401)
  assert.equal((await adminRequest({who:viewerId,method:'POST',body:{action:'activate_work_pass_signing'}})).status,403)
  const initial=await adminRequest()
  assert.equal(initial.status,200)
  assert.equal(initial.body.enabled,false)
})
test('Admin click automatically provisions storage and activates real ECDSA signatures',async()=>{
  const activated=await adminRequest({method:'POST',body:{action:'activate_work_pass_signing'}})
  assert.equal(activated.status,200,JSON.stringify(activated.body))
  assert.equal(activated.body.enabled,true)
  assert.equal(activated.body.source,'admin')
  first=activated.body.keyId
  assert.match(first,/^wp-[0-9a-f]{20}$/)
  assert.doesNotMatch(JSON.stringify(activated.body),/PRIVATE KEY|encrypted_private|auth_tag/)
  const {rows:installed}=await pool.query("SELECT migration_id FROM chombutar_schema_migrations WHERE migration_id='work-pass-signing-2026-10'")
  assert.equal(installed.length,1)
  const {rows}=await pool.query("SELECT encrypted_private,public_jwk FROM work_pass_signing_keys WHERE active=true")
  assert.equal(rows.length,1)
  assert.ok(rows[0].encrypted_private.length>100)
  assert.equal(Buffer.from(rows[0].encrypted_private).includes(Buffer.from('BEGIN PRIVATE KEY')),false)
  assert.equal(rows[0].public_jwk.d,undefined,'Public JWK must never expose a private scalar')
  const {workPassKey,getWorkPass}=await import('../api/_lib/workPass.js')
  const publicData=await workPassKey()
  assert.equal(publicData.configured,true)
  assert.equal(publicData.keyId,first)
  const pass=await getWorkPass('workpasskeyviewer')
  assert.equal(pass.signatureStatus,'signed')
  assert.equal(pass.keyId,first)
  assert.equal(validateToken(pass.token,publicData),true)
  assert.equal(validateToken(pass.token.slice(0,-2)+'aa',publicData),false)
  const duplicate=await adminRequest({method:'POST',body:{action:'activate_work_pass_signing'}})
  assert.equal(duplicate.status,409)
  const {rows:audit}=await pool.query(`SELECT COUNT(*)::int AS count
    FROM admin_audit_logs WHERE action='activate_work_pass_signing'`)
  assert.equal(audit[0].count,1)
})
test('Admin rotates keys with confirmation and still publishes old public keys',async()=>{
  const denied=await adminRequest({method:'POST',body:{action:'rotate_work_pass_signing'}})
  assert.equal(denied.status,400)
  const rotated=await adminRequest({method:'POST',body:{
    action:'rotate_work_pass_signing',confirmation:'ROTATE WORK PASS KEY',
  }})
  assert.equal(rotated.status,200,JSON.stringify(rotated.body))
  second=rotated.body.keyId
  assert.notEqual(second,first)
  const {workPassKey,getWorkPass}=await import('../api/_lib/workPass.js')
  const publicData=await workPassKey()
  assert.equal(publicData.keyId,second)
  assert.ok(publicData.keys.some(entry=>entry.keyId===first))
  assert.ok(publicData.keys.some(entry=>entry.keyId===second))
  const newPass=await getWorkPass('workpasskeyviewer')
  assert.equal(newPass.keyId,second)
  assert.equal(validateToken(newPass.token,publicData),true)
  const {rows:previous}=await pool.query('SELECT active,retired_at FROM work_pass_signing_keys WHERE key_id=$1',[first])
  assert.equal(previous[0].active,false)
  assert.ok(previous[0].retired_at)
  const status=await adminRequest()
  assert.equal(status.status,200)
  assert.equal(status.body.historicalKeys,1)
  assert.doesNotMatch(JSON.stringify(status.body),/PRIVATE KEY|encrypted_private|auth_tag|salt/)
})
