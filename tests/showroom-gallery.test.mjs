import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let db,pool,gallery
const creator=randomUUID(),viewer=randomUUID(),admin=randomUUID(),hatId=randomUUID()
const image={
  public_id:'chombutar_hats/'+creator+'/verified',
  url:'https://res.cloudinary.com/example/image/upload/v1/verified.png',
  type:'image',
}
let postId

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-showroom-gallery-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,username] of [[creator,'gallery_creator'],[viewer,'gallery_viewer'],[admin,'gallery_admin']]){
    await pool.query('INSERT INTO users(id,username,full_name,email,password_hash,is_admin) VALUES($1,$2,$2,$3,\'hash\',$4)',
      [id,username,username+'@example.test',id===admin])
  }
  await pool.query("INSERT INTO hats(id,user_id,hat_title,username,category) VALUES($1,$2,'Photography','gallery_creator','Photography')",
    [hatId,creator])
  await pool.query(`INSERT INTO hat_media(hat_id,url,public_id,type,screening_status)
    VALUES($1,$2,$3,'image','passed')`,[hatId,image.url,image.public_id])
  gallery=await import('../api/_lib/showroomGallery.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('signed-only new uploads cannot silently fall back to an unsigned preset',async()=>{
  const previous=process.env.HAT_MEDIA_SIGNED_UPLOADS
  delete process.env.HAT_MEDIA_SIGNED_UPLOADS
  try {
    await assert.rejects(gallery.signGalleryUpload(creator,{mime:'image/png',bytes:1234}),{status:503})
  } finally {if(previous===undefined) delete process.env.HAT_MEDIA_SIGNED_UPLOADS
    else process.env.HAT_MEDIA_SIGNED_UPLOADS=previous}
})

test('own approved images publish standalone and are not attached to escrow or bookings',async()=>{
  const result=await gallery.publishGallery(creator,{media:image,caption:'A photography demo'})
  postId=result.id
  assert.equal(result.moderation_status,'visible')
  assert.ok(postId)
  const post=await gallery.galleryPost(viewer,postId)
  assert.equal(post.post.is_entertainment,true)
  assert.equal(post.post.hat_title,null)
  assert.equal(post.post.media[0].url,image.url)
  assert.equal(post.post.category,'Entertainment')
  const url=new URL('http://localhost/api/showroom?view=for_you')
  const feed=await gallery.galleryFeed(viewer,url)
  assert.ok(feed.posts.some(item=>item.id===postId))
  await assert.rejects(gallery.publishGallery(creator,{media:image,caption:'Duplicate'}),{status:409})
})

test('contact bypass and other subscribers files cannot be published',async()=>{
  await assert.rejects(gallery.publishGallery(creator,{media:image,caption:'Contact on WhatsApp to book'}),{status:422})
  await assert.rejects(gallery.publishGallery(viewer,{media:image,caption:'Stolen photo'}),{status:422})
})

test('likes, reports and view counts enforce post visibility and authorship',async()=>{
  const first=await gallery.galleryAction(viewer,{action:'like_gallery',post_id:postId})
  assert.equal(first.liked,true)
  assert.equal(first.likes,1)
  const second=await gallery.galleryAction(viewer,{action:'like_gallery',post_id:postId})
  assert.equal(second.liked,false)
  assert.equal(second.likes,0)
  assert.equal((await gallery.galleryAction(viewer,{action:'view_gallery',post_id:postId})).viewed,true)
  assert.equal((await gallery.galleryAction(viewer,{action:'view_gallery',post_id:postId})).viewed,false)
  assert.equal((await gallery.galleryAction(creator,{action:'report_gallery',post_id:postId,reason:'spam'})).reported,false)
  assert.equal((await gallery.galleryAction(viewer,{action:'report_gallery',post_id:postId,reason:'spam'})).reported,true)
  assert.equal((await gallery.galleryAction(viewer,{action:'report_gallery',post_id:postId,reason:'spam'})).reported,false)
  assert.ok((await gallery.adminGalleryQueue()).items.some(row=>row.id===postId))
})

test('moderator decisions make posts unavailable and retain the audit trail',async()=>{
  const decision=await gallery.adminGalleryDecision(admin,{post_id:postId,decision:'reject'})
  assert.equal(decision.moderation_status,'rejected')
  await assert.rejects(gallery.galleryPost(viewer,postId),{status:404})
  await assert.rejects(gallery.galleryAction(viewer,{action:'like_gallery',post_id:postId}),{status:404})
  assert.equal((await gallery.galleryPost(creator,postId)).post.moderation_status,'rejected')
  const audit=(await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='review_showroom_gallery'")).rows[0]
  assert.equal(audit.n,1)
  assert.ok((await gallery.galleryMine(creator)).posts.some(row=>row.id===postId))
})

test('only the author can delete, and deleting does not affect source Hat',async()=>{
  await assert.rejects(gallery.galleryAction(viewer,{action:'delete_gallery',post_id:postId}),{status:404})
  assert.deepEqual(await gallery.galleryAction(creator,{action:'delete_gallery',post_id:postId}),{deleted:true})
  await assert.rejects(gallery.galleryPost(creator,postId),{status:404})
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hats WHERE id=$1',[hatId])).rows[0].n,1)
})
