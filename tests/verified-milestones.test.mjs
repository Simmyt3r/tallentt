import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

let db,pool,discovery,awards,seals
const admin=randomUUID(),talent=randomUUID(),clientId=randomUUID()
const visitor=randomUUID(),newViewer=randomUUID(),oldOwner=randomUUID()
let hatId,otherHat,escrowId,hireId,transferId

const patch=async path=>pool.query(await readFile(new URL('../'+path,import.meta.url),'utf8'))
const addHat=async(owner,name,role='client',visible=false)=>{
  const {rows}=await pool.query(`INSERT INTO hats(user_id,username,hat_title,hat_name,category,role,feed_visible,active)
    VALUES($1,$2,$3,$3,'Art & Design',$4,$5,TRUE) RETURNING id`,
    [owner,owner===talent?'milestone_talent':'milestone_user',name,role,visible])
  return rows[0].id
}
async function paidEscrow(){
  const {rows}=await pool.query(`INSERT INTO escrows(hat_id,client_id,talent_id,amount,status,work_status,released_at)
    VALUES($1,$2,$3,50000,'released','completed',NOW()) RETURNING id`,
    [hatId,clientId,talent])
  const id=rows[0].id
  await pool.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,escrow_id)
    VALUES($1,'escrow_release',35000,35000,'success',$2)`,[talent,id])
  return id
}
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await patch('db/schema.sql')
  await patch('db/patch-associates-2026-10.sql')
  await patch('db/patch-orbit-milestones-2026-11.sql')
  await patch('db/patch-employment-2026-10.sql')
  await patch('db/patch-wallet-peer-transfers-2026-11.sql')
  for(const [id,name,role,isAdmin,days] of [
    [admin,'milestone_admin','dual',true,90],
    [talent,'milestone_talent','talent',false,80],
    [clientId,'milestone_client','client',false,70],
    [visitor,'milestone_viewer','client',false,50],
    [newViewer,'milestone_new','client',false,0],
    [oldOwner,'milestone_old','client',false,50],
  ]){
    await pool.query(`INSERT INTO users(id,username,full_name,email,password_hash,role,is_admin,created_at)
      VALUES($1,$2,$2,$3,'hash',$4,$5,NOW()-($6::int*INTERVAL '1 day'))`,
      [id,name,name+'@example.test',role,isAdmin,days])
  }
  hatId=await addHat(talent,'Main published talent Hat','talent',true)
  otherHat=await addHat(talent,'Second published talent Hat','talent',true)
  await pool.query(`INSERT INTO hat_media(hat_id,url,public_id,type,screening_status)
    VALUES($1,'https://example.test/1','mile_main','image','passed'),
      ($2,'https://example.test/2','mile_second','image','passed')`,[hatId,otherHat])
  for(let n=0;n<12;n++)await addHat(oldOwner,'Old Hat '+n)
  await patch('db/patch-orbit-verified-2026-11.sql')
  awards=await import('../api/_lib/verifiedMilestones.js')
  discovery=await import('../api/_lib/qualifiedDiscovery.js')
  seals=await import('../api/_lib/milestoneSeals.js')
})
after(async()=>{await db?.close();delete global.__tworldPool})

test('grandfathers existing Hats, gives new users ten, and blocks extra Hats without earned slots',async()=>{
  const old=await awards.hatAllowance(oldOwner)
  assert.equal(old.baseline,12)
  assert.equal(old.used,12)
  assert.equal(old.remaining,0)
  const fresh=await awards.hatAllowance(visitor)
  assert.equal(fresh.baseline,10)
  assert.equal(fresh.used,0)
  assert.equal(fresh.remaining,10)
  for(let n=0;n<10;n++)await addHat(visitor,'Quota Hat '+n)
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await assert.rejects(awards.enforceHatAllowance(client,visitor),{status:409,code:'HAT_ALLOWANCE_REACHED'})
    await client.query('ROLLBACK')
  }finally{client.release()}
})

test('published cleared Showcase awards +0.1 once without automatically unlocking more Hats',async()=>{
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const one=await awards.awardPublishedShowcase(client,hatId)
    assert.equal(one.recorded,true)
    assert.equal(one.points,0.1)
    assert.equal(one.hats_unlocked,0)
    assert.equal((await awards.awardPublishedShowcase(client,hatId)).recorded,false)
    await client.query('COMMIT')
  }finally{client.release()}
  assert.equal((await awards.milestoneOrbitSummary(talent)).talent_points,0.1)
})

test('Book credits only after recorded released work, and retries cannot duplicate it',async()=>{
  const fake=await pool.query(`INSERT INTO escrows(hat_id,client_id,talent_id,amount,status,work_status)
    VALUES($1,$2,$3,25000,'secured','awaiting_start') RETURNING id`,[hatId,clientId,talent])
  const dbClient=await pool.connect()
  try{
    await dbClient.query('BEGIN')
    assert.equal((await awards.awardCompletedBooking(dbClient,fake.rows[0].id)).recorded,false)
    await dbClient.query('COMMIT')
  }finally{dbClient.release()}
  escrowId=await paidEscrow()
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    assert.equal((await awards.awardCompletedBooking(client,escrowId)).recorded,true)
    assert.equal((await awards.awardCompletedBooking(client,escrowId)).recorded,false)
    await client.query('COMMIT')
  }finally{client.release()}
  const score=await awards.milestoneOrbitSummary(talent)
  assert.equal(score.by_verb.find(v=>v.verb==='Book').points,'5.0')
})

test('qualified Discovery requires intentional open, five server-timed active seconds and a persisted action',async()=>{
  const opened=await discovery.discoveryAction(visitor,{action:'discovery_open',hat_id:hatId})
  assert.ok(opened.session_id)
  await assert.rejects(discovery.discoveryAction(visitor,{action:'discovery_complete',session_id:opened.session_id}),{status:409})
  await pool.query(`UPDATE orbit_discovery_sessions
    SET opened_at=NOW()-INTERVAL '14 seconds',
      first_heartbeat_at=NOW()-INTERVAL '9 seconds',last_heartbeat_at=NOW()-INTERVAL '2 seconds',
      heartbeat_count=3 WHERE id=$1`,[opened.session_id])
  await pool.query(`INSERT INTO hat_likes(hat_id,user_id,created_at)
    VALUES($1,$2,NOW()-INTERVAL '1 second')`,[hatId,visitor])
  const result=await discovery.discoveryAction(visitor,{action:'discovery_complete',session_id:opened.session_id})
  assert.equal(result.status,'awarded')
  assert.equal(result.award.points,1)
  assert.equal(result.award.hats_unlocked,2)
  const replay=await discovery.discoveryAction(visitor,{action:'discovery_complete',session_id:opened.session_id})
  assert.equal(replay.alreadyProcessed,true)
  const duplicate=await discovery.discoveryAction(visitor,{action:'discovery_open',hat_id:otherHat})
  assert.equal(duplicate.alreadyQualified,true)
})

test('suspicious new-account Discovery is held; appeal and admin approval are audited',async()=>{
  const opened=await discovery.discoveryAction(newViewer,{action:'discovery_open',hat_id:hatId})
  await pool.query(`UPDATE orbit_discovery_sessions
    SET opened_at=NOW()-INTERVAL '14 seconds',
      first_heartbeat_at=NOW()-INTERVAL '9 seconds',last_heartbeat_at=NOW()-INTERVAL '2 seconds',
      heartbeat_count=3 WHERE id=$1`,[opened.session_id])
  await pool.query(`INSERT INTO hat_likes(hat_id,user_id,created_at)
    VALUES($1,$2,NOW()-INTERVAL '1 second')`,[hatId,newViewer])
  const held=await discovery.discoveryAction(newViewer,{action:'discovery_complete',session_id:opened.session_id})
  assert.equal(held.status,'held')
  const queue=await discovery.adminDiscoveryQueue()
  assert.ok(queue.cases.some(s=>s.id===opened.session_id))
  const appeal=await discovery.discoveryAction(talent,{action:'discovery_appeal',session_id:opened.session_id,
    explanation:'We met through this published talent profile and the action was deliberate.'})
  assert.equal(appeal.status,'pending')
  await assert.rejects(discovery.discoveryAction(talent,{action:'discovery_appeal',session_id:opened.session_id,
    explanation:'Repeating the appeal must not open duplicate cases or points.'}),{status:409})
  await discovery.adminDiscoveryDecision(admin,{session_id:opened.session_id,decision:'approve',
    reason:'Real profile interaction corroborated with review records.'})
  const {rows:record}=await pool.query('SELECT state,reviewed_by FROM orbit_discovery_sessions WHERE id=$1',[opened.session_id])
  assert.equal(record[0].state,'awarded')
  assert.equal(record[0].reviewed_by,admin)
  const {rows:audit}=await pool.query("SELECT COUNT(*)::int AS n FROM orbit_milestone_decisions WHERE action='discovery_approve'")
  assert.equal(audit[0].n,1)
})

test('Collab Seal needs a completed paid job and both named parties before +3 per role',async()=>{
  const first=await seals.milestoneSealAction(clientId,{action:'seal_create',verb:'Collab',source_id:escrowId})
  assert.equal(first.status,'pending')
  await assert.rejects(seals.milestoneSealAction(visitor,{action:'seal_sign',seal_id:first.seal_id}),{status:404})
  const signed=await seals.milestoneSealAction(talent,{action:'seal_sign',seal_id:first.seal_id})
  assert.equal(signed.status,'sealed')
  assert.equal(signed.awards.length,2)
  assert.deepEqual(signed.awards.map(x=>x.points),[3,3])
  assert.equal((await seals.milestoneSealAction(talent,{action:'seal_sign',seal_id:first.seal_id})).alreadyProcessed,true)
})

test('Hire Seal requires two-party accepted employment and a confirmed salary period',async()=>{
  const {rows}=await pool.query(`INSERT INTO employment_agreements
      (employer_id,talent_id,status,terms,version,employer_accepted_at,talent_accepted_at,accepted_version)
    VALUES($1,$2,'active',$3::jsonb,1,NOW(),NOW(),1) RETURNING id`,
    [clientId,talent,JSON.stringify({salary:60000,talent:'Art & Design',start_on:'2026-10-01',due_day:10})])
  hireId=rows[0].id
  await assert.rejects(seals.milestoneSealAction(clientId,{action:'seal_create',verb:'Hire',source_id:hireId}),{status:409})
  await pool.query(`INSERT INTO employment_salary_periods(agreement_id,month,due_on,paid_on,method,status,confirmed_at,received_on)
    VALUES($1,'2026-10','2026-10-10','2026-10-10','cash','confirmed',NOW(),'2026-10-10')`,[hireId])
  const first=await seals.milestoneSealAction(clientId,{action:'seal_create',verb:'Hire',source_id:hireId})
  const done=await seals.milestoneSealAction(talent,{action:'seal_sign',seal_id:first.seal_id})
  assert.equal(done.status,'sealed')
  assert.deepEqual(done.awards.map(x=>x.points),[10,10])
})

test('Sponsor Seal never moves money; requires two successful reciprocal wallet ledger entries',async()=>{
  const {rows}=await pool.query(`INSERT INTO wallet_transfer_requests(sender_id,recipient_id,client_token,amount)
    VALUES($1,$2,$3,1000) RETURNING id`,[clientId,talent,randomUUID()])
  transferId=rows[0].id
  await assert.rejects(seals.milestoneSealAction(clientId,{action:'seal_create',verb:'Sponsor',source_id:transferId}),{status:409})
  await pool.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,transfer_id)
    VALUES($1,'wallet_transfer_sent',1000,0,'success',$3),($2,'wallet_transfer_received',1000,1000,'success',$3)`,
    [clientId,talent,transferId])
  const seal=await seals.milestoneSealAction(clientId,{action:'seal_create',verb:'Sponsor',source_id:transferId})
  const done=await seals.milestoneSealAction(talent,{action:'seal_sign',seal_id:seal.seal_id})
  assert.equal(done.status,'sealed')
  assert.equal(done.awards.length,1)
  assert.equal(done.awards[0].points,5)
  assert.equal((await awards.milestoneOrbitSummary(clientId)).client_points,13)
  assert.equal((await awards.milestoneOrbitSummary(talent)).talent_points,25.1)
})

test('Hat capacity sums durable per-verb slots but never exceeds ten per verb',async()=>{
  const result=await awards.hatAllowance(talent)
  assert.equal(result.credits.Book,10)
  assert.equal(result.credits.Discover,4)
  assert.equal(result.credits.Collab,6)
  assert.equal(result.credits.Hire,10)
  assert.equal(result.credits.Sponsor,10)
  assert.equal(result.credits.Showcase,0)
  assert.equal(result.total,50)
  assert.equal(result.used,2)
  assert.equal(result.remaining,48)
})
