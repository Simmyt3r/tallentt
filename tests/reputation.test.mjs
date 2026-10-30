import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'
test('reputation awards, real reviews, reversals and privacy',async()=>{
 const db=await testDatabase();global.__tworldPool=db.pool
 try{
  await db.pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await db.pool.query(await readFile(new URL('../db/patch-reputation-2026-10.sql',import.meta.url),'utf8'))
  const {reputationSummary:summary,reviewAction:act,reviewJobs,reputationLevel}=await import('../api/_lib/reputation.js')
  assert.equal(reputationLevel(1250),3);assert.equal(reputationLevel(-40),0)
  const employer=randomUUID(),talent=randomUUID(),admin=randomUUID(),outsider=randomUUID(),hat=randomUUID(),deal=randomUUID()
  for(const [id,name] of [[employer,'employer'],[talent,'talent'],[admin,'admin'],[outsider,'other']])await db.pool.query("INSERT INTO users(id,username,full_name,email,password_hash,is_admin) VALUES($1,$2,$2,$3,'test',$4)",[id,name,name+'@test.local',id===admin])
  await db.pool.query("INSERT INTO hats(id,user_id,username,hat_title,hat_name,category,role) VALUES($1,$2,'talent','Tailoring','Studio','Tailoring','talent')",[hat,talent])
  await db.pool.query("INSERT INTO escrows(id,hat_id,client_id,talent_id,amount) VALUES($1,$2,$3,$4,200000)",[deal,hat,employer,talent])
  assert.equal((await summary(talent)).talent.points,0)
  await assert.rejects(act(employer,{action:'review_submit',escrow_id:deal,stars:5,body:'Good work'}),/completed/)
  await db.pool.query("UPDATE escrows SET status='secured' WHERE id=$1",[deal])
  await db.pool.query("UPDATE escrows SET status='secured' WHERE id=$1",[deal])
  assert.equal((await summary(talent)).talent.points,20)
  assert.equal((await summary(employer)).employer.points,30)
  await db.pool.query("UPDATE escrows SET status='released',work_status='completed',released_at=NOW() WHERE id=$1",[deal])
  assert.equal((await reviewJobs(employer,talent)).jobs.length,1)
  await assert.rejects(act(outsider,{action:'review_submit',escrow_id:deal,stars:5,body:'Fake review'}),/not found/)
  const body={action:'review_submit',escrow_id:deal,stars:5,body:'Carefully finished garments.'}
  await act(employer,body);await act(employer,body)
  assert.equal((await summary(talent)).talent.points,60)
  assert.equal((await summary(talent)).ratings[0].count,1)
  assert.equal((await reviewJobs(employer,talent)).jobs.length,0)
  await assert.rejects(act(employer,{...body,stars:4}),/already reviewed/)
  await act(talent,{action:'review_submit',escrow_id:deal,stars:4,body:'Clear expectations.'})
  assert.equal((await summary(employer)).ratings[0].rating,4)
  const review=(await summary(talent)).reviews[0]
  await assert.rejects(act(outsider,{action:'review_hide',review_id:review.id,reason:'An invalid moderation request.'}),/Administrator/)
  await act(admin,{action:'review_hide',review_id:review.id,reason:'Review withdrawn after evidence review.'})
  await act(admin,{action:'review_hide',review_id:review.id,reason:'Review withdrawn after evidence review.'})
  assert.equal((await summary(talent)).talent.points,20)
  assert.equal((await summary(talent)).reviews.length,0)
  const refunded=randomUUID()
  await db.pool.query("INSERT INTO escrows(id,hat_id,client_id,talent_id,amount) VALUES($1,$2,$3,$4,1000)",[refunded,hat,employer,talent])
  await db.pool.query("UPDATE escrows SET status='secured' WHERE id=$1",[refunded])
  await db.pool.query("UPDATE escrows SET status='refunded',work_status='refunded' WHERE id=$1",[refunded])
  assert.equal((await summary(talent)).talent.points,20)
  assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM reputation_events WHERE reverses_id IS NOT NULL')).rows[0].n,3)
 }finally{delete global.__tworldPool;await db.close()}
})
