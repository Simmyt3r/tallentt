import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let db,pool,orbit
const admin=randomUUID(),talent=randomUUID(),client=randomUUID(),hatId=randomUUID()
let dealId
before(async()=>{
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await pool.query(await readFile(new URL('../db/patch-orbit-review-2026-10.sql',import.meta.url),'utf8'))
  for(const [id,name,role,isAdmin] of [[admin,'orbit_admin','talent',true],
    [talent,'orbit_talent','talent',false],[client,'orbit_client','client',false]]){
    await pool.query('INSERT INTO users(id,username,full_name,email,password_hash,role,is_admin) VALUES($1,$2,$2,$3,$4,$5,$6)',
      [id,name,name+'@example.test','hash',role,isAdmin])
  }
  await pool.query("INSERT INTO hats(id,user_id,hat_title,hat_name,username,category) VALUES($1,$2,'Art','Art','orbit_talent','Art & Design')",
    [hatId,talent])
  orbit=await import('../api/_lib/accountOrbit.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('Orbit Score weights are bounded, six-dimensional and sum to 100',()=>{
  assert.throws(()=>orbit.validateOrbitWeights({profile:30}),{status:400})
  assert.throws(()=>orbit.validateOrbitWeights({...orbit.ORBIT_DEFAULTS,likes:10}),{status:400})
  assert.throws(()=>orbit.validateOrbitWeights({...orbit.ORBIT_DEFAULTS,profile:12}),{status:400})
  assert.deepEqual(orbit.validateOrbitWeights(orbit.ORBIT_DEFAULTS),orbit.ORBIT_DEFAULTS)
})

test('high raw likes and views cannot alter Orbit Score',()=>{
  const metrics={completedProfileFields:3,verifiedIdentity:false,
    completedWork:1,successfulHires:0,activeDays:3,accountAgeDays:20}
  const low=orbit.calculateOrbitScore({...metrics,likes:0,views:0})
  const high=orbit.calculateOrbitScore({...metrics,likes:5000000,views:100000000})
  assert.equal(low.score,high.score)
  assert.equal(low.max,null)
})

test('completed escrow evidence raises Orbit; repeat account views do not',async()=>{
  const baseline=await orbit.accountOrbit(talent)
  const {rows}=await pool.query(`INSERT INTO escrows(hat_id,talent_id,client_id,amount,status,work_status)
    VALUES($1,$2,$3,3000,'released','completed') RETURNING id`,[hatId,talent,client])
  dealId=rows[0].id
  const afterWork=await orbit.accountOrbit(talent)
  assert.ok(afterWork.score>baseline.score)
  const afterHire=await orbit.accountOrbit(client)
  assert.ok(afterHire.factors.find(x=>x.key==='successful_hires').earned>0)
  await pool.query('UPDATE hats SET likes=999999,views=999999 WHERE id=$1',[hatId])
  const afterLikes=await orbit.accountOrbit(talent)
  assert.equal(afterLikes.score,afterWork.score)
})

test('configuration changes are audited and affect scoring',async()=>{
  const weights={profile:20,verification:20,completed_work:20,successful_hires:20,contributions:10,tenure:10}
  await orbit.saveOrbitWeights(admin,weights)
  assert.deepEqual((await orbit.orbitAdminStatus()).weights,weights)
  const logs=await pool.query("SELECT COUNT(*)::int AS n FROM admin_audit_logs WHERE action='configure_orbit_score'")
  assert.equal(logs.rows[0].n,1)
})

test('Hat review requires a meaningful note and does not rewrite escrow status',async()=>{
  assert.ok((await orbit.newHatReviewQueue()).hats.some(x=>x.id===hatId))
  await assert.rejects(orbit.reviewHatData(admin,{hat_id:hatId,decision:'needs_changes',note:'Bad'}),{status:400})
  const result=await orbit.reviewHatData(admin,{
    hat_id:hatId,decision:'needs_changes',note:'Please correct the published pricing details.',
  })
  assert.equal(result.decision,'needs_changes')
  const reviews=await orbit.newHatReviewQueue()
  assert.equal(reviews.hats.find(item=>item.id===hatId).decision,'needs_changes')
  assert.equal((await pool.query('SELECT status FROM escrows WHERE id=$1',[dealId])).rows[0].status,'released')
  const corrected=await orbit.reviewHatData(admin,{hat_id:hatId,decision:'reviewed',note:''})
  assert.equal(corrected.decision,'reviewed')
})


test('Orbit continues growing beyond every former activity ceiling and keeps roles separate',()=>{
  const metrics={completedProfileFields:5,verifiedIdentity:true,
    completedWork:100,successfulHires:100,activeDays:100,accountAgeDays:3650}
  const first=orbit.calculateOrbitScore(metrics)
  const next=orbit.calculateOrbitScore({...metrics,completedWork:101,successfulHires:101,
    activeDays:101,accountAgeDays:4015})
  assert.ok(first.score>100)
  assert.ok(next.score>first.score)
  for(const role of ['talent','client']){
    assert.ok(first.byRole[role].score>100)
    assert.ok(next.byRole[role].score>first.byRole[role].score)
    assert.equal(next.byRole[role].max,null)
  }
  const talentOnly=orbit.calculateOrbitScore({...metrics,completedWork:101})
  assert.ok(talentOnly.byRole.talent.score>first.byRole.talent.score)
  assert.equal(talentOnly.byRole.client.score,first.byRole.client.score)
})

test('all publishing days count after the former 50-day query limit',async()=>{
  await pool.query(`INSERT INTO hats(user_id,username,hat_title,hat_name,category,created_at,active,feed_visible)
    SELECT $1,'orbit_talent','Orbit day '||n,'Orbit day '||n,'Art & Design',
      NOW()-n*INTERVAL '1 day',TRUE,TRUE FROM generate_series(1,65) AS n`,[talent])
  const result=await orbit.accountOrbit(talent)
  assert.ok(result.metrics.activeDays>=65)
  assert.equal(result.factors.find(f=>f.key==='contributions').earned,result.metrics.activeDays)
})

test('legacy Hat activity also keeps growing with completed bookings',async()=>{
  const {computeOrbitScore}=await import('../api/_lib/orbitScore.js')
  const first=computeOrbitScore({bookings:1000})
  assert.ok(first>100)
  assert.ok(computeOrbitScore({bookings:1001})>first)
})
