import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let db,pool,associates,orbit
const follower=randomUUID(),talent=randomUUID(),clientAccount=randomUUID(),followerTwo=randomUUID()

before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-associates-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,username,role] of [
    [follower,'keepup_follower','client'],
    [followerTwo,'keepup_follower_two','client'],
    [talent,'keepup_talent','talent'],
    [clientAccount,'keepup_client','client'],
  ])await pool.query('INSERT INTO users(id,username,full_name,email,password_hash,role) VALUES($1,$2,$2,$3,$4,$5)',
    [id,username,username+'@example.test','hash',role])
  await pool.query(`INSERT INTO hats(user_id,username,hat_title,hat_name,category,role,active,feed_visible)
    VALUES($1,'keepup_talent','Published Hat','Published Hat','Art & Design','talent',TRUE,TRUE)`,[talent])
  associates=await import('../api/_lib/associates.js')
  orbit=await import('../api/_lib/accountOrbit.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

const follow=(who,other,action='associate_follow')=>associates.associatesAction(who,{action,other_id:other})
const summary=async person=>(await orbit.accountOrbit(person))

test('existing subscribers never receive an invented retrospective KeepUp award',async()=>{
  await follow(followerTwo,talent)
  const initial=await summary(talent)
  assert.equal(initial.milestones.keep_up.enabled,false)
  await pool.query(await readFile(new URL('../db/patch-orbit-milestones-2026-11.sql',import.meta.url),'utf8'))
  const now=await summary(talent)
  assert.equal(now.score,initial.score)
  assert.equal(now.milestones.keep_up.unlocked_hats,0)
  assert.equal(now.milestones.keep_up.first_time_pairs,0)
})

test('first verified KeepUp adds one Talent point, unlocks three once and never changes Client lane',async()=>{
  const beforeScore=await summary(talent)
  await follow(follower,talent)
  const afterScore=await summary(talent)
  assert.equal(afterScore.score,beforeScore.score+1)
  assert.equal(afterScore.byRole.talent.score,beforeScore.byRole.talent.score+1)
  assert.equal(afterScore.byRole.client.score,beforeScore.byRole.client.score)
  assert.equal(afterScore.milestones.keep_up.points,1)
  assert.equal(afterScore.milestones.keep_up.unlocked_hats,3)
  assert.equal(afterScore.milestones.keep_up.first_time_pairs,1)
  await assert.rejects(follow(follower,talent),{status:409})
  assert.equal((await summary(talent)).milestones.keep_up.points,1)
})

test('Un-KeepUp reverses only Orbit points; refollow restores points without re-awarding Hats',async()=>{
  await follow(follower,talent,'associate_unfollow')
  assert.equal((await summary(talent)).milestones.keep_up.points,0)
  await follow(follower,talent)
  const restored=await summary(talent)
  assert.equal(restored.milestones.keep_up.points,1)
  assert.equal(restored.milestones.keep_up.unlocked_hats,3)
  assert.equal(restored.milestones.keep_up.first_time_pairs,1)
  await follow(follower,talent,'associate_unfollow')
  const reversed=await summary(talent)
  assert.equal(reversed.milestones.keep_up.points,0)
  assert.equal(reversed.milestones.keep_up.unlocked_hats,3)
  const {rows}=await pool.query(`SELECT kind,points::text AS points,hats_unlocked
    FROM orbit_milestone_events WHERE actor_id=$1 AND subject_id=$2 ORDER BY id`,[follower,talent])
  assert.deepEqual(rows.map(r=>r.kind),['award','reverse','restore','reverse'])
  assert.deepEqual(rows.map(r=>r.hats_unlocked),[3,0,0,0])
  assert.equal(rows.reduce((n,r)=>n+Number(r.points),0),0)
})

test('a Client follow is allowed but never mints a Talent milestone',async()=>{
  await follow(follower,clientAccount)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM orbit_milestone_events WHERE subject_id=$1",[clientAccount])).rows[0].n,0)
})

test('blocking a connection revokes its existing KeepUp points in the same transaction',async()=>{
  await follow(follower,talent)
  const beforeBlock=await summary(talent)
  assert.equal(beforeBlock.milestones.keep_up.points,1)
  await associates.associatesAction(follower,{action:'associate_request',other_id:talent})
  await associates.associatesAction(talent,{action:'associate_block',other_id:follower})
  const afterBlock=await summary(talent)
  assert.equal(afterBlock.milestones.keep_up.points,0)
  assert.equal(afterBlock.milestones.keep_up.unlocked_hats,3)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM subscriber_follows WHERE follower_id=$1 AND followed_id=$2',[follower,talent])).rows[0].n,0)
  await assert.rejects(follow(follower,talent),{status:403})
})

test('concurrent duplicate follows do not mint multiple first-time pair awards',async()=>{
  const [first,second]=await Promise.allSettled([
    follow(followerTwo,clientAccount),follow(followerTwo,clientAccount),
  ])
  assert.equal([first,second].filter(r=>r.status==='fulfilled').length,1)
  assert.equal([first,second].filter(r=>r.status==='rejected'&&r.reason?.status===409).length,1)
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM orbit_milestone_events WHERE actor_id=$1 AND subject_id=$2",[followerTwo,clientAccount])).rows[0].n,0)
})
