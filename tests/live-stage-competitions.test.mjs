import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

const host=randomUUID(),alice=randomUUID(),bob=randomUUID(),audience=randomUUID()
const streamAlice=randomUUID(),streamBob=randomUUID()
let pool,db,stage,contestId
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-live-stage-competitions-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,username,role] of [[host,'stage_host','talent'],[alice,'stage_alice','talent'],
    [bob,'stage_bob','dual'],[audience,'stage_audience','client']]){
    await pool.query('INSERT INTO users(id,username,full_name,email,password_hash,role) VALUES($1,$2,$2,$3,$4,$5)',
      [id,username,username+'@example.test','hash',role])
  }
  for(const [id,talent,path] of [[streamAlice,alice,'live-alice'],[streamBob,bob,'live-bob']]){
    await pool.query(`INSERT INTO live_streams(id,talent_id,title,category,status,media_status,stream_path)
      VALUES($1,$2,'Competition stream','Music','live','connected',$3)`,[id,talent,path])
  }
  stage=await import('../api/_lib/stageCompetitions.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('Stage only permits talent/dual to host, with bounded entrants',async()=>{
  await assert.rejects(stage.createStageCompetition(audience,{title:'Music Cup',category:'Music'}),{status:403})
  await assert.rejects(stage.createStageCompetition(host,{title:'Cup',category:'Music'}),{status:400})
  const created=await stage.createStageCompetition(host,{title:'Friday Music Cup',category:'Music',max_contestants:2})
  contestId=created.id
  assert.ok(created.id)
  const list=await stage.listStageCompetitions()
  assert.ok(list.competitions.some(item=>item.id===contestId))
})

test('contestants must own an actual connected video stream',async()=>{
  await assert.rejects(stage.stageCompetitionAction(alice,{
    action:'stage_join',competition_id:contestId,stream_id:streamBob,
  }),{status:409})
  await assert.rejects(stage.stageCompetitionAction(host,{
    action:'stage_join',competition_id:contestId,stream_id:streamAlice,
  }),{status:403})
  assert.deepEqual(await stage.stageCompetitionAction(alice,{
    action:'stage_join',competition_id:contestId,stream_id:streamAlice,
  }),{ok:true})
  await assert.rejects(stage.stageCompetitionAction(alice,{
    action:'stage_join',competition_id:contestId,stream_id:streamAlice,
  }),{status:409})
  const joined=await stage.stageCompetitionAction(bob,{
    action:'stage_join',competition_id:contestId,stream_id:streamBob,
  })
  assert.equal(joined.ok,true)
})

test('only host starts two eligible live entrants; no voting before start',async()=>{
  await assert.rejects(stage.stageCompetitionAction(audience,{
    action:'stage_vote',competition_id:contestId,talent_id:alice,
  }),{status:409})
  await assert.rejects(stage.stageCompetitionAction(alice,{
    action:'stage_start',competition_id:contestId,
  }),{status:403})
  assert.equal((await stage.stageCompetitionAction(host,{
    action:'stage_start',competition_id:contestId,
  })).ok,true)
})

test('one audience vote, no host, contestants or duplicate votes',async()=>{
  for(const voter of [host,alice,bob]){
    await assert.rejects(stage.stageCompetitionAction(voter,{
      action:'stage_vote',competition_id:contestId,talent_id:alice,
    }),{status:403})
  }
  assert.equal((await stage.stageCompetitionAction(audience,{
    action:'stage_vote',competition_id:contestId,talent_id:alice,
  })).ok,true)
  await assert.rejects(stage.stageCompetitionAction(audience,{
    action:'stage_vote',competition_id:contestId,talent_id:bob,
  }),{status:409})
  const result=await stage.stageCompetition(audience,contestId)
  assert.equal(result.voted_for,alice)
  assert.equal(result.entrants[0].talent_id,alice)
  assert.equal(result.entrants[0].votes,1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n,0)
})

test('competition completion freezes voting and retains leaderboard',async()=>{
  assert.equal((await stage.stageCompetitionAction(host,{
    action:'stage_complete',competition_id:contestId,
  })).ok,true)
  await assert.rejects(stage.stageCompetitionAction(audience,{
    action:'stage_vote',competition_id:contestId,talent_id:bob,
  }),{status:409})
  const result=await stage.stageCompetition(audience,contestId)
  assert.equal(result.competition.status,'completed')
  assert.equal(result.entrants[0].votes,1)
})
