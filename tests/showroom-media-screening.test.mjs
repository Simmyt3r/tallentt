import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { testDatabase } from './database.mjs'
let authorizedScreeningWorker, classifyImageAnnotations, trustedMediaImageUri
let screenQueuedMedia, inspectMediaAsset, newMediaScreeningStatus

let db, pool, showroom, admin, signSession
const owners = [randomUUID(),randomUUID(),randomUUID()]
const hatIds = [randomUUID(),randomUUID(),randomUUID()]
const mediaIds = [randomUUID(),randomUUID(),randomUUID()]

before(async () => {
  db = await testDatabase()
  pool = db.pool
  global.__tworldPool = pool
  ;({
    authorizedScreeningWorker, classifyImageAnnotations, trustedMediaImageUri,
    screenQueuedMedia, inspectMediaAsset, newMediaScreeningStatus,
  } = await import('../api/_lib/showroomMediaScreening.js'))
  process.env.JWT_SECRET = 'screening-test-jwt-secret'
  process.env.SHOWROOM_MEDIA_SCREENING = 'enforce'
  process.env.GOOGLE_CLOUD_VISION_API_KEY = 'unit-test-key'
  process.env.SHOWROOM_WORKER_SECRET = 'very-long-screening-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  await pool.query(await readFile(new URL('../db/showroom-media-screening.sql', import.meta.url), 'utf8'))
  showroom = (await import('../api/showroom/index.js')).default
  admin = (await import('../api/admin/index.js')).default
  signSession = (await import('../api/_lib/auth.js')).signSession
  for(let i=0;i<3;i++){
    await pool.query(
      `INSERT INTO users (id,full_name,username,email,password_hash,role,is_admin)
       VALUES ($1,$2,$3,$4,'fake-hash','dual',$5)`,
      [owners[i],`Owner ${i}`,`mediaowner${i}`,`mediaowner${i}@example.test`,i===2],
    )
    await pool.query(
      `INSERT INTO hats (id,user_id,username,hat_title,hat_name,category,role,active)
       VALUES ($1,$2,$3,'Professional portrait photographer','Photography','Film','talent',true)`,
      [hatIds[i],owners[i],`mediaowner${i}`],
    )
  }
  for(let i=0;i<2;i++){
    await pool.query(
      `INSERT INTO hat_media (id,hat_id,url,public_id,type,screening_status)
       VALUES ($1,$2,$3,$4,'image','pending')`,
      [mediaIds[i],hatIds[i],`https://res.cloudinary.com/demo/image/upload/v123/artist/picture${i}.jpg`,`artist/picture${i}`],
    )
  }
})
after(async()=>{
  await db?.close()
  delete global.__tworldPool
  delete process.env.SHOWROOM_MEDIA_SCREENING
  delete process.env.GOOGLE_CLOUD_VISION_API_KEY
  delete process.env.SHOWROOM_WORKER_SECRET
})

async function request(handler,url,{who=null,method='GET',body=null,auth=null}={}){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{url,method,headers:{host:'localhost',authorization:auth || '',
    cookie:who===null?'':`cw_session=${signSession({sub:owners[who]})}`}})
  const res={statusCode:200,setHeader(){},end(raw){this.body=JSON.parse(raw)}}
  await handler(req,res)
  return res
}

test('image annotation thresholds hold possible unsafe content or embedded contact details',()=>{
  assert.deepEqual(classifyImageAnnotations({fullTextAnnotation:{text:'08031234567'},
    safeSearchAnnotation:{adult:'UNLIKELY'}}),
    {status:'held',reason:'contact_details_in_media'})
  assert.deepEqual(classifyImageAnnotations({safeSearchAnnotation:{adult:'VERY_LIKELY'}}),
    {status:'held',reason:'possible_unsafe_media'})
  assert.deepEqual(classifyImageAnnotations({safeSearchAnnotation:{adult:'POSSIBLE',violence:'UNLIKELY'}}),
    {status:'passed',reason:null})
})

test('Cloudinary media URI validation prevents passing arbitrary URLs to remote OCR',()=>{
  const media={type:'image',public_id:'artist/portrait',
    url:'https://res.cloudinary.com/demo/image/upload/v1760000000/artist/portrait.jpg'}
  assert.equal(trustedMediaImageUri(media,'demo'),media.url)
  assert.equal(trustedMediaImageUri({...media,url:'https://evil.invalid/ssrf.jpg'},'demo'),null)
  assert.equal(trustedMediaImageUri({...media,public_id:'other'},'demo'),null)
  assert.equal(trustedMediaImageUri({...media,url:'http://res.cloudinary.com/demo/image/upload/v123/artist/portrait.jpg'},'demo'),null)
  assert.match(trustedMediaImageUri({...media,type:'video',
    url:'https://res.cloudinary.com/demo/video/upload/v123/artist/portrait.mp4'},'demo'),/so_0,w_640,c_limit/)
  assert.equal(newMediaScreeningStatus(),'pending')
})

test('Vision adapter uses both OCR and SafeSearch and never returns a PASS from an incomplete response',async()=>{
  const media={type:'image',public_id:'artist/portrait',
    url:'https://res.cloudinary.com/demo/image/upload/v123/artist/portrait.jpg'}
  const stub=async (_url,options)=>{
    const body=JSON.parse(options.body)
    assert.deepEqual(body.requests[0].features.map(x=>x.type),['TEXT_DETECTION','SAFE_SEARCH_DETECTION'])
    return {ok:true,json:async()=>({responses:[{safeSearchAnnotation:{adult:'UNLIKELY'},fullTextAnnotation:{text:'Contact my WhatsApp'}}]})}
  }
  assert.equal((await inspectMediaAsset(media,{fetchImpl:stub,cloud:'demo',apiKey:'dummy'})).status,'held')
  await assert.rejects(inspectMediaAsset(media,{fetchImpl:async()=>({ok:true,json:async()=>({responses:[{}]})}),cloud:'demo',apiKey:'dummy'}),/incomplete/)
})

test('background worker requires a strong secret and cannot be executed by ordinary users',async()=>{
  assert.equal(authorizedScreeningWorker('Bearer wrongsecret'),false)
  assert.equal(authorizedScreeningWorker('Bearer very-long-screening-test-secret'),true)
  const anon=await request(showroom,'/api/showroom?worker=1')
  assert.equal(anon.statusCode,401)
  const user=await request(showroom,'/api/showroom?worker=1',{who:0})
  assert.equal(user.statusCode,401)
  // Genuine worker execution uses the same endpoint and is independently authenticated.
})

test('pending media is hidden until worker approves; held content needs explicit admin review',async()=>{
  assert.equal((await request(showroom,'/api/showroom?view=new')).body.hats.length,0)
  let result=await screenQueuedMedia({inspect:async j=>j.id===mediaIds[0]
    ?{status:'passed',reason:null}:{status:'held',reason:'contact_details_in_media'}})
  assert.equal(result.checked,2)
  assert.equal(result.passed,1)
  assert.equal(result.held,1)
  const visible=await request(showroom,'/api/showroom?view=new')
  assert.deepEqual(visible.body.hats.map(h=>h.id),[hatIds[0]])
  assert.equal((await pool.query('SELECT active FROM hats WHERE id = $1',[hatIds[1]])).rows[0].active,true)
  assert.equal((await request(admin,'/api/admin?action=showroom_media',{who:0})).statusCode,403)
  const queue=await request(admin,'/api/admin?action=showroom_media',{who:2})
  assert.equal(queue.body.counts.held,1)
  assert.equal(queue.body.items[0].media_id,mediaIds[1])
  assert.equal((await request(admin,'/api/admin',{who:0,method:'POST',body:{
    action:'resolve_showroom_media',mediaId:mediaIds[1],decision:'approve',
  }})).statusCode,403)
  const approved=await request(admin,'/api/admin',{who:2,method:'POST',body:{
    action:'resolve_showroom_media',mediaId:mediaIds[1],decision:'approve',
  }})
  assert.equal(approved.statusCode,200,JSON.stringify(approved.body))
  assert.equal((await request(showroom,'/api/showroom?view=new')).body.hats.length,2)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM admin_audit_logs WHERE action='resolve_showroom_media'")).rows[0].count,1)
})

test('same exact asset reused across creators is automatically held rather than assumed original',async()=>{
  await pool.query(
    `INSERT INTO hat_media (id,hat_id,url,public_id,type,screening_status)
     VALUES ($1,$2,'https://res.cloudinary.com/demo/image/upload/v123/artist/picture0.jpg',
       'artist/picture0','image','pending')`,
    [mediaIds[2],hatIds[2]],
  )
  const result=await screenQueuedMedia({inspect:async()=>({status:'passed',reason:null})})
  assert.equal(result.held,1)
  const status=(await pool.query('SELECT screening_status,screening_reason FROM hat_media WHERE id=$1',[mediaIds[2]])).rows[0]
  assert.equal(status.screening_status,'held')
  assert.equal(status.screening_reason,'asset_used_by_another_creator')
})

test('temporary scanner failures retry with backoff then hold instead of silently publishing',async()=>{
  const id=randomUUID()
  await pool.query(
    `INSERT INTO hat_media (id,hat_id,url,public_id,type,screening_status)
     VALUES ($1,$2,'https://res.cloudinary.com/demo/image/upload/v123/artist/new.jpg',
       'artist/new','image','pending')`,[id,hatIds[1]],
  )
  for(let attempt=1;attempt<=3;attempt++){
    await pool.query('UPDATE hat_media SET screening_retry_at=NOW() WHERE id=$1',[id])
    const response=await screenQueuedMedia({inspect:async()=>{throw Error('transient Vision outage')}})
    assert.equal(response.checked,1)
    const row=(await pool.query('SELECT screening_status,screening_attempts FROM hat_media WHERE id=$1',[id])).rows[0]
    assert.equal(row.screening_attempts,attempt)
    assert.equal(row.screening_status,attempt<3?'pending':'held')
  }
})

test('owner can appeal automated held media and moderator can restore discovery',async()=>{
  const own=await request(showroom,'/api/showroom?action=my_moderation',{who:1})
  const item=own.body.items.find(item=>item.hat_id===hatIds[1])
  assert.ok(item)
  assert.ok(item.held_media_count>=1)
  const requestBody={action:'appeal',hat_id:hatIds[1],explanation:'These are my original photos. I have removed the contact information.'}
  const submitted=await request(showroom,'/api/showroom',{who:1,method:'POST',body:requestBody})
  assert.equal(submitted.statusCode,201,JSON.stringify(submitted.body))
  const queue=await request(admin,'/api/admin?action=showroom_appeals',{who:2})
  const appeal=queue.body.items.find(x=>x.hat_id===hatIds[1])
  assert.ok(appeal)
  const approved=await request(admin,'/api/admin',{who:2,method:'POST',body:{
    action:'resolve_showroom_appeal',appealId:appeal.id,decision:'approve',note:'Reviewed evidence and image.',
  }})
  assert.equal(approved.statusCode,200,JSON.stringify(approved.body))
  const held=(await pool.query("SELECT COUNT(*)::int AS count FROM hat_media WHERE hat_id=$1 AND screening_status IN ('held','rejected')",[hatIds[1]])).rows[0].count
  assert.equal(held,0)
  assert.ok((await request(showroom,'/api/showroom?view=new')).body.hats.some(h=>h.id===hatIds[1]))
})

test('editing a Hat while its media is being screened requeues it rather than losing the lease',async()=>{
  const hatHandler=(await import('../api/hats/[id].js')).default
  await pool.query(
    `UPDATE hat_media SET screening_status='processing',screening_locked_at=NOW(),
     screening_lock_token=gen_random_uuid() WHERE id=$1`,[mediaIds[1]],
  )
  const {rows}=await pool.query(
    'SELECT url,public_id,type,caption FROM hat_media WHERE hat_id=$1 ORDER BY created_at,id',[hatIds[1]],
  )
  const response=await request(hatHandler,`/api/hats/${hatIds[1]}`,{
    who:1,method:'PUT',body:{media:rows,motto:'Available for professional events'},
  })
  assert.equal(response.statusCode,200,JSON.stringify(response.body))
  const after=(await pool.query(
    "SELECT screening_status FROM hat_media WHERE hat_id=$1 AND public_id='artist/picture1'",[hatIds[1]],
  )).rows[0]
  assert.equal(after.screening_status,'pending')
  const scanned=await screenQueuedMedia({inspect:async()=>({status:'passed',reason:null})})
  assert.equal(scanned.passed,1)
})
