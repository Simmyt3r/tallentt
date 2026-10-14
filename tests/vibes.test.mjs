import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

let db,pool,handler,signSession
const author=randomUUID(),friend=randomUUID(),stranger=randomUUID()

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  process.env.JWT_SECRET='vibes-regression-test-secret'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../db/patch-vibes-2026-10.sql',import.meta.url),'utf8')
  await pool.query(patch)
  await pool.query(patch)
  signSession=(await import('../api/_lib/auth.js')).signSession
  handler=(await import('../api/vibes/index.js')).default
  for(const [id,name] of [[author,'creator'],[friend,'subscriber'],[stranger,'outsider']]){
    await pool.query(`INSERT INTO users (id,full_name,username,email,password_hash,role)
      VALUES($1,$2,$2,$3,'test','dual')`,[id,name,name+'@example.test'])
  }
})
after(async()=>{await db?.close();delete global.__tworldPool;delete process.env.VIBES_MEDIA_UPLOADS;delete process.env.GOOGLE_CLOUD_VISION_API_KEY})

async function request(method,url,body={},who=author) {
  const req=Readable.from(body&&method==='POST'?[Buffer.from(JSON.stringify(body))]:[])
  Object.assign(req,{method,url,headers:{host:'localhost',cookie:who?'cw_session='+signSession({sub:who}):''}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.body=JSON.parse(s)}}
  await handler(req,res)
  return {status:res.statusCode,body:res.body,headers:res.headers}
}

test('Vibes migration is repeatable and public posts require authentication',async()=>{
  const unauthorized=await request('GET','/api/vibes',undefined,null)
  assert.equal(unauthorized.status,401)
  assert.equal((await pool.query("SELECT to_regclass('vibes_upload_permits') AS r")).rows[0].r,'vibes_upload_permits')
})
let posted
test('post, author identity and timeline pagination use owned server fields',async()=>{
  assert.equal((await request('POST','/api/vibes',{action:'publish',text:'   '})).status,400)
  assert.equal((await request('POST','/api/vibes',{action:'publish',text:'a'.repeat(501)})).status,400)
  const sent=await request('POST','/api/vibes',{action:'publish',text:'Hello community!'})
  assert.equal(sent.status,201,JSON.stringify(sent.body))
  posted=sent.body.id
  const data=await request('GET','/api/vibes',undefined,friend)
  assert.equal(data.status,200)
  assert.equal(data.headers['Cache-Control'],'private, no-store')
  assert.equal(data.body.posts[0].body,'Hello community!')
  assert.equal(data.body.posts[0].username,'creator')
  assert.equal(data.body.posts[0].likes,0)
  assert.equal(data.body.posts[0].liked_by_me,false)
})
test('reactions, replies, owner deletion and safe reports are account scoped',async()=>{
  assert.equal((await request('POST','/api/vibes',{action:'like',post_id:posted},friend)).body.likes,1)
  assert.equal((await request('POST','/api/vibes',{action:'like',post_id:posted},friend)).body.likes,0)
  assert.equal((await request('POST','/api/vibes',{action:'reply',post_id:posted,text:'Nice work!'},friend)).status,200)
  const replies=await request('GET','/api/vibes?comments='+posted,undefined,author)
  assert.equal(replies.body.comments[0].body,'Nice work!')
  assert.equal((await request('POST','/api/vibes',{action:'delete_reply',post_id:posted,comment_id:replies.body.comments[0].id},stranger)).status,404)
  assert.equal((await request('POST','/api/vibes',{action:'report',post_id:posted,reason:'spam'},stranger)).body.reported,true)
  assert.equal((await request('POST','/api/vibes',{action:'report',post_id:posted,reason:'spam'},stranger)).body.reported,false)
  assert.equal((await request('POST','/api/vibes',{action:'report',post_id:posted,reason:'spam'},author)).body.reported,false)
  assert.equal((await request('POST','/api/vibes',{action:'delete',post_id:posted},friend)).status,404)
  assert.equal((await request('POST','/api/vibes',{action:'delete',post_id:posted},author)).status,200)
  assert.equal((await request('GET','/api/vibes',undefined,friend)).body.posts.length,0)
})
test('photo upload requires deliberate enablement and verified Cloudinary credentials',async()=>{
  delete process.env.VIBES_MEDIA_UPLOADS
  assert.equal((await request('POST','/api/vibes',{action:'upload_sign',mime:'image/png',bytes:1024})).status,503)
  assert.equal((await request('POST','/api/vibes',{action:'publish',text:'A text-only idea',media:[{
    upload_id:randomUUID(),public_id:'forged/photo',url:'https://evil.invalid/pic.jpg',
  }]})).status,503)
  process.env.VIBES_MEDIA_UPLOADS='enabled'
  process.env.GOOGLE_CLOUD_VISION_API_KEY='test'
  process.env.CLOUDINARY_CLOUD_NAME='demo'
  process.env.CLOUDINARY_API_KEY='fixture-key'
  process.env.CLOUDINARY_API_SECRET='fixture-secret'
  assert.equal((await request('POST','/api/vibes',{action:'upload_sign',mime:'image/svg+xml',bytes:1024})).status,400)
  const signed=await request('POST','/api/vibes',{action:'upload_sign',mime:'image/png',bytes:1024})
  assert.equal(signed.status,200,JSON.stringify(signed.body))
  assert.ok(signed.body.signature)
  const invalid=await request('POST','/api/vibes',{action:'publish',text:'Photo!',
    media:[{upload_id:signed.body.permitId,public_id:'other/owner',url:'https://evil.invalid/photo'}]})
  assert.equal(invalid.status,422)
})
