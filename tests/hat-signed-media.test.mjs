import test, {before, after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'

let db,pool,upload,hats,signSession
const alice=randomUUID(), bob=randomUUID()
const SECRET='test-cloudinary-secret-material',cloud='testcloud'
const previousEnv={}
const keys=['HAT_MEDIA_SIGNED_UPLOADS','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','JWT_SECRET']
before(async()=>{
  for(const k of keys)previousEnv[k]=process.env[k]
  process.env.HAT_MEDIA_SIGNED_UPLOADS='enforce'
  process.env.CLOUDINARY_CLOUD_NAME=cloud
  process.env.CLOUDINARY_API_KEY='key-123'
  process.env.CLOUDINARY_API_SECRET=SECRET
  process.env.JWT_SECRET='signed-upload-test-auth-secret'
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/hat-media-signed-uploads.sql',import.meta.url),'utf8'))
  for(const [id,name]of [[alice,'uploadalice'],[bob,'uploadbob']]){
    await pool.query(`INSERT INTO users (id,full_name,username,email,password_hash,role)
      VALUES ($1,$2,$2,$3,'fake','talent')`,[id,name,name+'@example.test'])
  }
  upload=await import('../api/_lib/hatMediaUpload.js')
  hats=(await import('../api/hats/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{
  await db?.close()
  delete global.__tworldPool
  for(const k of keys)if(previousEnv[k]===undefined)delete process.env[k];else process.env[k]=previousEnv[k]
})
async function request(method='POST',body={},user=alice){
  const req=Readable.from([Buffer.from(JSON.stringify(body))])
  Object.assign(req,{method,url:'/api/hats',headers:{host:'localhost',cookie:user?'cw_session='+signSession({sub:user}):''}})
  const res={statusCode:200,setHeader(){},end(raw){this.body=JSON.parse(raw)}}
  await hats(req,res)
  return res
}
const uploadResponse=(permit,overrides={})=>{
  const resType=permit.resourceType
  const secure_url=`https://res.cloudinary.com/${cloud}/${resType}/upload/v1773000000/${permit.params.public_id}.jpg`
  return {public_id:permit.params.public_id,resource_type:resType,type:'upload',bytes:1500,version:1773000000,secure_url,...overrides}
}
const view=(asset,assertRequest=()=>{})=>async(url,options)=>{
  assertRequest(url,options)
  return {ok:true,json:async()=>asset}
}

test('signature endpoint requires a session and validates mime and size',async()=>{
  assert.equal((await request('POST',{action:'upload_sign',mime:'image/png',bytes:1500},null)).statusCode,401)
  assert.equal((await request('POST',{action:'upload_sign',mime:'application/x-msdownload',bytes:100})).statusCode,400)
  assert.equal((await request('POST',{action:'upload_sign',mime:'image/jpeg',bytes:22e6})).statusCode,400)
  const signed=await request('POST',{action:'upload_sign',mime:'image/png',bytes:1500})
  assert.equal(signed.statusCode,200,JSON.stringify(signed.body))
  assert.equal(signed.body.enabled,true)
  assert.equal(signed.body.permitId.length,36)
  assert.ok(signed.body.params.public_id.startsWith('chombutar_hats/'+alice+'/'))
  assert.equal(signed.body.params.overwrite,'false')
  assert.equal(signed.body.apiKey,'key-123')
  assert.equal('apiSecret' in signed.body,false)
  assert.equal(signed.body.signature,upload.cloudinaryUploadSignature(signed.body.params,SECRET))
  assert.equal(signed.body.resourceType,'image')
})

test('new media must have user-owned unexpired permit and authoritative Cloudinary metadata',async()=>{
  const permit=await upload.issueHatUploadPermit(alice,{mime:'image/jpeg',bytes:1500})
  const asset=uploadResponse(permit)
  const body={upload_id:permit.permitId,public_id:permit.params.public_id,url:asset.secure_url,type:'image'}
  const verified=await upload.verifyNewHatMedia(alice,[body],[],{
    fetchImpl:view(asset,(url,opts)=>{
      assert.ok(url.includes(encodeURIComponent(permit.params.public_id)))
      assert.match(opts.headers.Authorization,/^Basic /)
    }),
  })
  assert.deepEqual(verified,[{permitId:permit.permitId,publicId:permit.params.public_id}])
  await assert.rejects(upload.verifyNewHatMedia(bob,[body],[],{fetchImpl:view(asset)}),/authorization has expired/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[{...body,url:'https://evil.invalid'}],[],{fetchImpl:view(asset)}),/does not match/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[{...body,public_id:'someone-else'}],[],{fetchImpl:view(asset)}),/authorization has expired/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[{...body,upload_id:randomUUID()}],[],{fetchImpl:view(asset)}),/authorization has expired/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[{...body,upload_id:undefined}],[],{fetchImpl:view(asset)}),/secure uploader/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[body,body],[],{fetchImpl:view(asset)}),/twice/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[body],[],{fetchImpl:view({...asset,bytes:22e6})}),/does not match/)
  await assert.rejects(upload.verifyNewHatMedia(alice,[body],[],{fetchImpl:view({...asset,type:'private'})}),/does not match/)
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const hatId=randomUUID()
    await client.query(`INSERT INTO hats (id,user_id,username,hat_title,hat_name,category,role)
      VALUES ($1,$2,'uploadalice','Photographer','Portraits','Film','talent')`,[hatId,alice])
    await upload.claimHatMediaPermits(client,alice,hatId,verified)
    await client.query('COMMIT')
    await assert.rejects(upload.verifyNewHatMedia(alice,[body],[],{fetchImpl:view(asset)}),/authorization has expired/)
    await client.query('BEGIN')
    await assert.rejects(upload.claimHatMediaPermits(client,alice,hatId,verified),/already used/)
    await client.query('ROLLBACK')
  }finally{client.release()}
})

test('expired permits and cross-account media references are rejected',async()=>{
  const permit=await upload.issueHatUploadPermit(alice,{mime:'video/mp4',bytes:1500})
  const asset=uploadResponse(permit,{secure_url:`https://res.cloudinary.com/${cloud}/video/upload/v1773000000/${permit.params.public_id}.mp4`})
  const body={upload_id:permit.permitId,public_id:permit.params.public_id,url:asset.secure_url,type:'video'}
  await pool.query("UPDATE hat_media_upload_permits SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[permit.permitId])
  await assert.rejects(upload.verifyNewHatMedia(alice,[body],[],{fetchImpl:view(asset)}),/expired/)
  await assert.rejects(upload.verifyNewHatMedia(bob,[body],[],{fetchImpl:view(asset)}),/expired/)
})

test('rollout disabled keeps legacy upload path temporarily, without issuing signed permits',async()=>{
  process.env.HAT_MEDIA_SIGNED_UPLOADS='off'
  try{
    const response=await request('POST',{action:'upload_sign',mime:'image/jpeg',bytes:500})
    assert.equal(response.statusCode,200)
    assert.equal(response.body.enabled,false)
    const ignored=await upload.verifyNewHatMedia(alice,[{url:'legacy',public_id:'legacy',type:'image'}])
    assert.deepEqual(ignored,[])
  }finally{process.env.HAT_MEDIA_SIGNED_UPLOADS='enforce'}
})
