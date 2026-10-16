import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.mjs'

let db,pool,verifyNewHatMedia
const ownerId=randomUUID(),otherId=randomUUID()
const sourceHat=randomUUID(),otherHat=randomUUID()
const asset={
  public_id:'chombutar_hats/'+ownerId+'/accepted',
  url:'https://res.cloudinary.com/demo/image/upload/v1/accepted.jpg',
  type:'image'
}
const forbidden={public_id:'chombutar_hats/'+otherId+'/private',
  url:'https://res.cloudinary.com/demo/image/upload/v1/private.jpg',type:'image'}

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  process.env.HAT_MEDIA_SIGNED_UPLOADS='enforce'
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-vibes-2026-10.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-showroom-gallery-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,username] of [[ownerId,'mediaowner'],[otherId,'mediaother']]) {
    await pool.query("INSERT INTO users(id,username,full_name,email,password_hash) VALUES($1,$2,$2,$3,'x')",
      [id,username,username+'@example.test'])
  }
  for(const [id,user,username] of [[sourceHat,ownerId,'mediaowner'],[otherHat,otherId,'mediaother']]){
    await pool.query("INSERT INTO hats(id,user_id,hat_title,username,category) VALUES($1,$2,'Portfolio',$3,'Photography')",
      [id,user,username])
  }
  for(const [hat,item,status] of [[sourceHat,asset,'passed'],[otherHat,forbidden,'passed']]){
    await pool.query("INSERT INTO hat_media(hat_id,url,public_id,type,screening_status) VALUES($1,$2,$3,$4,$5)",
      [hat,item.url,item.public_id,item.type,status])
  }
  verifyNewHatMedia=(await import('../api/_lib/hatMediaUpload.js')).verifyNewHatMedia
})
after(async()=>{
  await db?.close()
  delete global.__tworldPool
  delete process.env.HAT_MEDIA_SIGNED_UPLOADS
})

test('approved library media can be attached by its original owner without a second upload',async()=>{
  assert.deepEqual(await verifyNewHatMedia(ownerId,[asset],[]),[])
})

test('another subscriber cannot import private media even when URL and public ID are known',async()=>{
  await assert.rejects(verifyNewHatMedia(ownerId,[forbidden],[]),{status:422})
  await assert.rejects(verifyNewHatMedia(otherId,[asset],[]),{status:422})
})

test('held or rejected images must never be reused from the gallery',async()=>{
  await pool.query("UPDATE hat_media SET screening_status='held' WHERE public_id=$1",[asset.public_id])
  await assert.rejects(verifyNewHatMedia(ownerId,[asset],[]),{status:422})
  await pool.query("UPDATE hat_media SET screening_status='passed' WHERE public_id=$1",[asset.public_id])
})

test('owned, visible Vibes photos can be reused; held posts cannot',async()=>{
  const vibe={public_id:'chombutar_vibes/'+ownerId+'/image',
    url:'https://res.cloudinary.com/demo/image/upload/v1/vibe.jpg',type:'image'}
  const {rows}=await pool.query("INSERT INTO vibes_posts(author_id,body,media) VALUES($1,'Vibes picture',$2::jsonb) RETURNING id",
    [ownerId,JSON.stringify([vibe])])
  assert.deepEqual(await verifyNewHatMedia(ownerId,[vibe],[]),[])
  await assert.rejects(verifyNewHatMedia(otherId,[vibe],[]),{status:422})
  await pool.query("UPDATE vibes_posts SET moderation_status='held' WHERE id=$1",[rows[0].id])
  await assert.rejects(verifyNewHatMedia(ownerId,[vibe],[]),{status:422})
})

test('approved independent showcase can become a Hat asset without granting third parties reuse',async()=>{
  const file={
    public_id:'chombutar_hats/'+ownerId+'/converted',
    url:'https://res.cloudinary.com/demo/image/upload/v1/converted.jpg',type:'image',
  }
  const {rows}=await pool.query(`INSERT INTO showroom_gallery_posts
    (author_id,public_id,media_url,media_type,caption,moderation_status)
    VALUES($1,$2,$3,'image','Visible demo','visible') RETURNING id`,
    [ownerId,file.public_id,file.url])
  assert.deepEqual(await verifyNewHatMedia(ownerId,[file],[]),[])
  await assert.rejects(verifyNewHatMedia(otherId,[file],[]),{status:422})
  await pool.query("UPDATE showroom_gallery_posts SET moderation_status='held' WHERE id=$1",[rows[0].id])
  await assert.rejects(verifyNewHatMedia(ownerId,[file],[]),{status:422})
  await pool.query("UPDATE showroom_gallery_posts SET moderation_status='visible',deleted_at=NOW() WHERE id=$1",[rows[0].id])
  await assert.rejects(verifyNewHatMedia(ownerId,[file],[]),{status:422})
})
