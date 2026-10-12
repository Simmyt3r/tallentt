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
async function request({who=adminId,action='showroom_screening_config',method='GET',settings={},mediaId=null}={}){
  const url = method === 'GET' ? '/api/admin?action='+action : '/api/admin'
  const body = method==='POST' ? {action,settings,mediaId} : null
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

test('admin run-now records a safe operational history and excludes ordinary users',async()=>{
  assert.equal((await request({who:normalId,action:'showroom_screening_ops'})).statusCode,403)
  assert.equal((await request({who:normalId,method:'POST',action:'run_showroom_screening'})).statusCode,403)
  const run=await request({method:'POST',action:'run_showroom_screening'})
  assert.equal(run.statusCode,200,JSON.stringify(run.body))
  assert.equal(run.body.checked,0)
  assert.ok(run.body.runId)
  const ops=await request({action:'showroom_screening_ops'})
  assert.equal(ops.statusCode,200,JSON.stringify(ops.body))
  assert.equal(ops.body.runs[0].source,'admin')
  assert.equal(ops.body.runs[0].status,'completed')
  assert.equal(ops.body.runs[0].checked,0)
  assert.equal(JSON.stringify(ops.body).includes('testGoogleVisionKey'),false)
})

test('Cloud Vision test sends only a synthetic image and never exposes credentials',async()=>{
  const {testVisionConnection} = await import('../api/_lib/showroomVisionHealth.js')
  const stub = async (url,options) => {
    assert.equal(url,'https://vision.googleapis.com/v1/images:annotate')
    assert.equal(options.headers['x-goog-api-key'],'testGoogleVisionKey_123456789')
    assert.equal(url.includes('testGoogleVisionKey'),false)
    const payload=JSON.parse(options.body)
    assert.equal(payload.requests.length,1)
    assert.ok(payload.requests[0].image.content.startsWith('iVBORw'))
    assert.equal(payload.requests[0].image.source,undefined)
    return {ok:true,json:async()=>({responses:[{safeSearchAnnotation:{adult:'VERY_UNLIKELY'}}]})}
  }
  const result=await testVisionConnection({fetchImpl:stub})
  assert.equal(result.ok,true)
  assert.equal(JSON.stringify(result).includes('testGoogleVisionKey'),false)
  await assert.rejects(
    testVisionConnection({fetchImpl:async()=>({ok:false,status:403})}),
    /refused the test request/,
  )
  assert.equal((await request({who:normalId,method:'POST',action:'test_showroom_vision'})).statusCode,403)
})

test('disabling screening releases in-flight media but preserves human-review holds',async()=>{
  const hat=randomUUID()
  await pool.query(
    `INSERT INTO hats (id,user_id,username,hat_title,hat_name,category,role,active)
     VALUES ($1,$2,'configadmin','Creative portfolio','Photography','Photo','talent',true)`,
    [hat,adminId])
  for(const [status,reason] of [['pending',null],['processing',null],['held','possible_unsafe_media']]) {
    await pool.query(
      `INSERT INTO hat_media (hat_id,url,public_id,type,screening_status,screening_reason)
      VALUES ($1,'https://res.cloudinary.com/demo/image/upload/v123/test.jpg',$2,'image',$3,$4)`,
      [hat,'test-'+status,status,reason])
  }
  const off=await request({method:'POST',action:'save_showroom_screening_config',settings:{enabled:false}})
  assert.equal(off.statusCode,200,JSON.stringify(off.body))
  const {rows}=await pool.query('SELECT screening_status,screening_reason FROM hat_media WHERE hat_id=$1 ORDER BY public_id',[hat])
  assert.equal(rows.filter(x=>x.screening_status==='legacy').length,2)
  assert.equal(rows.filter(x=>x.screening_status==='held').length,1)
  assert.equal(rows.find(x=>x.screening_status==='held').screening_reason,'possible_unsafe_media')
})

test('only exhausted scanner errors may be retried with an audited admin action',async()=>{
  const {rows:hats}=await pool.query("SELECT id FROM hats WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[adminId])
  const hat=hats[0].id
  const {rows:items}=await pool.query(
    `INSERT INTO hat_media (hat_id,url,public_id,type,screening_status,screening_reason,screening_attempts)
     VALUES ($1,'https://res.cloudinary.com/demo/image/upload/v123/outage.jpg','test-outage','image','held','screening_unavailable',3)
     RETURNING id`,[hat])
  const mediaId=items[0].id
  assert.equal((await request({who:normalId,method:'POST',action:'retry_showroom_media',mediaId})).statusCode,403)
  const success=await request({method:'POST',action:'retry_showroom_media',mediaId})
  assert.equal(success.statusCode,200,JSON.stringify(success.body))
  assert.equal((await request({method:'POST',action:'retry_showroom_media',mediaId})).statusCode,409)
  const media=(await pool.query('SELECT screening_status,screening_attempts FROM hat_media WHERE id=$1',[mediaId])).rows[0]
  assert.equal(media.screening_status,'pending')
  assert.equal(media.screening_attempts,0)
  const unsafe=(await pool.query("SELECT id FROM hat_media WHERE hat_id=$1 AND screening_reason='possible_unsafe_media'",[hat])).rows[0].id
  assert.equal((await request({method:'POST',action:'retry_showroom_media',mediaId:unsafe})).statusCode,409)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='retry_showroom_media'")).rows[0].n,1)
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
  assert.equal(rows.length,3)
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
