import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'
let db,pool,pendingVibesVideos,reviewVibesVideo
const adminId=randomUUID(),authorId=randomUUID(),reporterId=randomUUID()
const postId=randomUUID()
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  const lib=await import('../api/_lib/vibesReview.js')
  pendingVibesVideos=lib.pendingVibesVideos
  reviewVibesVideo=lib.reviewVibesVideo
  for(const [id,username] of [[adminId,'review_admin'],[authorId,'vibes_author'],[reporterId,'vibes_reporter']])
    await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash)
      VALUES($1,$2,$2,$3,'test')`,[id,username,username+'@example.test'])
  await pool.query(`INSERT INTO vibes_posts(id,author_id,body,media,moderation_status)
    VALUES($1,$2,'A test post','[]'::jsonb,'visible')`,[postId,authorId])
  await pool.query(`INSERT INTO vibes_reports(post_id,reporter_id,reason)
    VALUES($1,$2,'spam')`,[postId,reporterId])
})
after(async()=>{await db?.close();delete global.__tworldPool})
test('reported visible posts appear in admin queue',async()=>{
  const queue=await pendingVibesVideos()
  const caseRecord=queue.posts.find(p=>p.id===postId)
  assert.equal(caseRecord.report_count,1)
  assert.deepEqual(caseRecord.report_reasons,['spam'])
})
test('dismissing reports retains the original evidence and administrative audit',async()=>{
  assert.deepEqual(await reviewVibesVideo(adminId,{post_id:postId,decision:'dismiss'}),
    {reviewed:true,decision:'dismiss'})
  const {rows}=await pool.query(`SELECT reporter_id,reason,resolution,resolved_at,resolved_by
    FROM vibes_reports WHERE post_id=$1`,[postId])
  assert.equal(rows.length,1)
  assert.equal(rows[0].reason,'spam')
  assert.equal(rows[0].resolution,'dismissed')
  assert.equal(rows[0].resolved_by,adminId)
  assert.ok(rows[0].resolved_at)
  assert.equal((await pendingVibesVideos()).posts.some(p=>p.id===postId),false)
  const {rows:audit}=await pool.query(`SELECT action,metadata FROM admin_audit_logs
    WHERE target_id=$1`,[postId])
  assert.equal(audit.length,1)
  assert.equal(audit[0].action,'moderate_vibes_video')
  assert.equal(audit[0].metadata.decision,'dismiss')
})
test('rejected report remains actioned and content is removed without destroying reports',async()=>{
  await pool.query(`UPDATE vibes_reports SET resolution='open',
    resolved_at=NULL,resolved_by=NULL WHERE post_id=$1`,[postId])
  await reviewVibesVideo(adminId,{post_id:postId,decision:'reject'})
  const {rows:[post]}=await pool.query(`SELECT moderation_status FROM vibes_posts WHERE id=$1`,[postId])
  const {rows:[report]}=await pool.query(`SELECT resolution FROM vibes_reports WHERE post_id=$1`,[postId])
  assert.equal(post.moderation_status,'removed')
  assert.equal(report.resolution,'actioned')
})
