import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'

let db, pool, handler, screening, signSession
const adminId = randomUUID(), normalId = randomUUID()
const cookie = (id) => 'cw_session=' + signSession({ sub: id })

before(async () => {
  db = await testDatabase()
  pool = db.pool
  global.__tworldPool = pool
  process.env.JWT_SECRET = 'showroom-admin-configuration-encryption-test-root'
  process.env.SHOWROOM_MEDIA_SCREENING = 'off'
  process.env.VITE_CLOUDINARY_CLOUD_NAME = 'demo'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  // Safe to repeat the dedicated migration after the full schema.
  await pool.query(await readFile(new URL('../db/showroom-admin-config.sql',import.meta.url),'utf8'))
  for(const [id,name,isAdmin] of [[adminId,'configadmin',true],[normalId,'configuser',false]]){
    await pool.query(
      "INSERT INTO users (id,full_name,username,email,password_hash,is_admin) VALUES ($1,$2,$2,$3,'fake',$4)",
      [id,name,name+'@example.test',isAdmin])
  }
  screening = await import('../api/_lib/showroomScreeningConfig.js')
  handler = (await import('../api/admin/index.js')).default
  signSession = (await import('../api/_lib/auth.js')).signSession
})
after(async()=> {
  await db?.close()
  delete global.__tworldPool
  delete process.env.SHOWROOM_MEDIA_SCREENING
  delete process.env.VITE_CLOUDINARY_CLOUD_NAME
})
async function request({who=adminId,action='showroom_screening_config',method='GET',settings={}}={}){
  const url = method === 'GET' ? '/api/admin?action='+action : '/api/admin'
  const body = method==='POST' ? {action,settings} : null
  const req = Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{url,method,headers:{host:'localhost',cookie:who?cookie(who):''}})
  const res = {statusCode:200,setHeader(){},end(raw){this.body=JSON.parse(raw)}}
  await handler(req,res)
  return res
}

test('admin-only status never discloses secrets and defaults to no screening',async()=>{
  assert.equal((await request({who:normalId})).statusCode,403)
  assert.equal((await request({who:null})).statusCode,401)
  const response = await request()
  assert.equal(response.statusCode,200,JSON.stringify(response.body))
  assert.equal(response.body.enabled,false)
  assert.equal(response.body.visionConfigured,false)
  assert.equal(response.body.workerConfigured,false)
  assert.equal(response.body.cloudName,'demo')
  assert.equal('visionKey' in response.body,false)
  assert.equal('workerSecret' in response.body,false)
})

test('cannot enable screening without Vision key and worker secret',async()=>{
  const result = await request({method:'POST',action:'save_showroom_screening_config',settings:{enabled:true}})
  assert.equal(result.statusCode,409,JSON.stringify(result.body))
  assert.equal((await screening.effectiveScreeningConfig()).enabled,false)
})

test('admin saves encrypted credentials, masks readback, and activates screening immediately',async()=>{
  const apiKey = 'testGoogleVisionKey_123456789'
  const worker = 'secret-rotation-long-enough-123456789'
  const saved = await request({method:'POST',action:'save_showroom_screening_config',settings:{
    cloudName:'demo',visionKey:apiKey,workerSecret:worker,enabled:true,
  }})
  assert.equal(saved.statusCode,200,JSON.stringify(saved.body))
  assert.equal(saved.body.enabled,true)
  assert.equal(saved.body.ready,true)
  assert.equal(JSON.stringify(saved.body).includes(apiKey),false)
  assert.equal(JSON.stringify(saved.body).includes(worker),false)
  const {rows} = await pool.query('SELECT * FROM showroom_screening_config')
  assert.equal(rows.length,1)
  assert.ok(rows[0].vision_key_encrypted.startsWith('v1.'))
  assert.ok(rows[0].worker_secret_encrypted.startsWith('v1.'))
  assert.equal(JSON.stringify(rows[0]).includes(apiKey),false)
  assert.equal(JSON.stringify(rows[0]).includes(worker),false)
  assert.equal((await screening.effectiveScreeningConfig()).visionKey,apiKey)
  const after = await request()
  assert.equal(after.body.visionConfigured,true)
  assert.equal('visionKey' in after.body,false)
  assert.equal('workerSecret' in after.body,false)
  const module = await import('../api/_lib/showroomMediaScreening.js')
  assert.equal(await module.mediaScreeningEnabled(),true)
  assert.equal(await module.newMediaScreeningStatus(),'pending')
  assert.equal(await module.authorizedScreeningWorker('Bearer '+worker),true)
  assert.equal(await module.authorizedScreeningWorker('Bearer incorrect'),false)
})

test('turn off screening without removing credentials or changing existing environment',async()=>{
  const off = await request({method:'POST',action:'save_showroom_screening_config',settings:{enabled:false}})
  assert.equal(off.statusCode,200,JSON.stringify(off.body))
  assert.equal(off.body.enabled,false)
  assert.equal((await screening.effectiveScreeningConfig()).visionKey,'testGoogleVisionKey_123456789')
  const module = await import('../api/_lib/showroomMediaScreening.js')
  assert.equal(await module.newMediaScreeningStatus(),'legacy')
  const {rows} = await pool.query(
    "SELECT action,metadata FROM admin_audit_logs WHERE action='update_showroom_screening_config' ORDER BY created_at DESC",
  )
  assert.equal(rows.length,2)
  assert.ok(rows.every(x => !JSON.stringify(x.metadata).includes('testGoogleVisionKey')))
})

test('generate and rotate worker secret returns it once; previous secret stops working',async()=>{
  const rotated = await request({method:'POST',action:'generate_showroom_worker_secret'})
  assert.equal(rotated.statusCode,200,JSON.stringify(rotated.body))
  const secret = rotated.body.workerSecretOnce
  assert.ok(secret.length >= 24)
  const status = await request()
  assert.equal('workerSecretOnce' in status.body,false)
  const module = await import('../api/_lib/showroomMediaScreening.js')
  assert.equal(await module.authorizedScreeningWorker('Bearer secret-rotation-long-enough-123456789'),false)
  assert.equal(await module.authorizedScreeningWorker('Bearer '+secret),true)
})
