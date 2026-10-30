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
  assert.equal((await request('POST','/api/vibes',{action:'publish',text:'a'.repeat(10001)})).status,400)
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


test('real signed photo receipts can publish after independent Cloudinary and SafeSearch verification',async()=>{
  process.env.VIBES_MEDIA_UPLOADS='enabled'
  process.env.GOOGLE_CLOUD_VISION_API_KEY='test-fixture-vision'
  process.env.CLOUDINARY_CLOUD_NAME='demo'
  process.env.CLOUDINARY_API_KEY='fixture-key'
  process.env.CLOUDINARY_API_SECRET='fixture-secret'
  const signed=await request('POST','/api/vibes',{action:'upload_sign',mime:'image/png',bytes:1024})
  assert.equal(signed.status,200)
  const url=`https://res.cloudinary.com/demo/image/upload/v123/${signed.body.params.public_id}.png`
  const originalFetch=global.fetch
  let cloudVerified=0,visionChecked=0
  global.fetch=async(target,options)=>{
    if(String(target).includes('/resources/image/upload/')){
      cloudVerified++
      assert.ok(String(options.headers.Authorization).startsWith('Basic '))
      return new Response(JSON.stringify({public_id:signed.body.params.public_id,resource_type:'image',
        type:'upload',bytes:1024,version:123,secure_url:url}),{status:200})
    }
    if(String(target).includes('/images:annotate')){
      visionChecked++
      assert.equal(options.headers['x-goog-api-key'],'test-fixture-vision')
      return new Response(JSON.stringify({responses:[{
        safeSearchAnnotation:{adult:'VERY_UNLIKELY',violence:'VERY_UNLIKELY',racy:'VERY_UNLIKELY'},
      }]}),{status:200})
    }
    throw Error('Unexpected request in Vibes media integration test')
  }
  try {
    const data=await request('POST','/api/vibes',{action:'publish',text:'My event photo',
      media:[{upload_id:signed.body.permitId,public_id:signed.body.params.public_id,url}]})
    assert.equal(data.status,201,JSON.stringify(data.body))
    assert.equal(cloudVerified,1)
    assert.equal(visionChecked,1)
    const page=await request('GET','/api/vibes',undefined,friend)
    const current=page.body.posts.find(p=>p.id===data.body.id)
    assert.equal(current.media[0].url,url)
    const reused=await request('POST','/api/vibes',{action:'publish',text:'Duplicate',
      media:[{upload_id:signed.body.permitId,public_id:signed.body.params.public_id,url}]})
    assert.equal(reused.status,422,'photos cannot be claimed twice')
  } finally {
    global.fetch=originalFetch
  }
})


test('Cloudinary-verified photos and videos auto-publish before Google Vision is configured',async()=>{
  process.env.VIBES_MEDIA_UPLOADS='enabled'
  delete process.env.GOOGLE_CLOUD_VISION_API_KEY
  process.env.CLOUDINARY_CLOUD_NAME='demo'
  process.env.CLOUDINARY_API_KEY='fixture-key'
  process.env.CLOUDINARY_API_SECRET='fixture-secret'
  const photo=await request('POST','/api/vibes',{action:'upload_sign',mime:'image/png',bytes:1024})
  const video=await request('POST','/api/vibes',{action:'upload_sign',mime:'video/mp4',bytes:2048})
  assert.equal(photo.status,200,JSON.stringify(photo.body))
  assert.equal(video.status,200,JSON.stringify(video.body))
  const photoUrl=`https://res.cloudinary.com/demo/image/upload/v123/${photo.body.params.public_id}.png`
  const videoUrl=`https://res.cloudinary.com/demo/video/upload/v123/${video.body.params.public_id}.mp4`
  const originalFetch=global.fetch
  let cloudVerified=0,visionChecked=0
  global.fetch=async(target,options)=>{
    const address=String(target)
    if(address.includes('/resources/image/upload/')||address.includes('/resources/video/upload/')){
      cloudVerified++
      const isVideo=address.includes('/resources/video/upload/')
      const signed=isVideo?video:photo
      return new Response(JSON.stringify({
        public_id:signed.body.params.public_id,
        resource_type:isVideo?'video':'image',
        type:'upload',
        bytes:isVideo?2048:1024,
        version:123,
        secure_url:isVideo?videoUrl:photoUrl,
        ...(isVideo?{duration:12}:{}),
      }),{status:200})
    }
    if(address.includes('/images:annotate')){
      visionChecked++
      throw new Error('Vision must not be called when its key is absent')
    }
    throw new Error('Unexpected request in no-Vision upload test')
  }
  try{
    const data=await request('POST','/api/vibes',{
      action:'publish',
      text:'My photo and video before Vision setup',
      media:[
        {upload_id:photo.body.permitId,public_id:photo.body.params.public_id,url:photoUrl},
        {upload_id:video.body.permitId,public_id:video.body.params.public_id,url:videoUrl},
      ],
    })
    assert.equal(data.status,201,JSON.stringify(data.body))
    assert.equal(data.body.pending_review,false)
    assert.equal(cloudVerified,2)
    assert.equal(visionChecked,0)
    const page=await request('GET','/api/vibes',undefined,friend)
    const current=page.body.posts.find(post=>post.id===data.body.id)
    assert.ok(current,'the new post should be visible in the public feed')
    assert.equal(current.media.length,2)
  }finally{
    global.fetch=originalFetch
  }
})
