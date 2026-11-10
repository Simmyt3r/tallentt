import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {simulateVerifiedRewards} from '../shared/adRewardPreview.js'
import {buildAdSimulationSnapshot} from '../shared/adSimulationSnapshot.js'

const UUID=()=>randomUUID()
function candidate(campaignId,talent,explorer,found=true){
  const evidence=found?[{talentId:talent,discovererId:explorer,sourceId:UUID(),createdAt:'2026-10-01T00:00:00Z'}]:[]
  return {
    campaign:{id:campaignId,state:'verifying',start_at:'2026-10-10T00:00:00Z',end_at:'2026-11-09T00:00:00Z'},
    eligible_talents:1,qualified_discovery_slots:evidence.length,
    verified_funding_evidence_na:'500000',billable_units:'2',
    candidate_earned_na:'500000',blockers:['Financial rules await owner approval'],
    qualification_policy:'provisional-early-discovery-v1',
    preview:simulateVerifiedRewards({earnedNa:500000,selectedTalentIds:[talent],
      verifiedDiscoveryEvidence:evidence})
  }
}
test('simulation snapshot reconciles every recipient and never invents a payout',()=>{
  const id=UUID(),talent=UUID(),explorer=UUID()
  const result=buildAdSimulationSnapshot(candidate(id,talent,explorer))
  assert.match(result.fingerprint,/^[a-f0-9]{64}$/)
  assert.deepEqual(result.lines.map(l=>l.ledger_kind).sort(),['explorer','platform','talent'])
  assert.equal(result.lines.reduce((sum,l)=>sum+BigInt(l.amount_naira),0n),500000n)
  const missing=buildAdSimulationSnapshot(candidate(id,talent,explorer,false))
  assert.equal(missing.lines.some(l=>l.ledger_kind==='unallocated_explorer'),true)
  assert.equal(missing.lines.some(l=>l.ledger_kind==='explorer'),false)
  assert.equal(missing.lines.reduce((sum,l)=>sum+BigInt(l.amount_naira),0n),500000n)
})

test('recorded simulations are immutable, idempotent, dispute-auditable and never touch wallet or real settlement',async()=>{
  const db=new PGlite(),owner=UUID(),adminA=UUID(),adminB=UUID(),campaignId=UUID(),advertiserId=UUID()
  const env={VERCEL_ENV:process.env.VERCEL_ENV,CHOMBUTAR_AD_SIMULATION_ENABLED:process.env.CHOMBUTAR_AD_SIMULATION_ENABLED}
  try{
    await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,role TEXT NOT NULL);
      CREATE TABLE hats(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),role TEXT NOT NULL,active BOOLEAN DEFAULT TRUE);
      CREATE TABLE wallets(user_id UUID PRIMARY KEY,balance BIGINT NOT NULL);
      CREATE TABLE wallet_transactions(id UUID PRIMARY KEY,amount BIGINT NOT NULL);
      INSERT INTO users(id,role) VALUES ('${owner}','talent'),('${adminA}','client'),('${adminB}','client');
      INSERT INTO wallets(user_id,balance) VALUES('${owner}',12345);`)
    for(const file of ['patch-ad-finance-foundation-2026-11.sql',
      'patch-ad-campaign-management-2026-11.sql','patch-ad-sponsored-slots-2026-11.sql',
      'patch-ad-settlement-simulation-2026-11.sql']){
      const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8')
      await db.exec(sql)
    }
    await db.query(`INSERT INTO ad_advertisers(id,owner_id,legal_name,status)
      VALUES($1,$2,'Demo Advertiser','approved')`,[advertiserId,owner])
    await db.query(`INSERT INTO ad_campaigns(id,advertiser_id,title,state)
      VALUES($1,$2,'Demo campaign','verifying')`,[campaignId,advertiserId])
    global.__tworldPool={query:db.query.bind(db)}
    const {createAdminAdSimulation,reviewAdminAdSimulation,adminAdSimulationList,adminAdSimulationDetail,
      simulationWritable}=await import('../api/_lib/adSimulation.js')
    const clientFactory=async()=>({query:db.query.bind(db),release(){}})
    process.env.VERCEL_ENV='preview'
    process.env.CHOMBUTAR_AD_SIMULATION_ENABLED='true'
    assert.equal(simulationWritable(),true)
    let current=candidate(campaignId,owner,adminA)
    const previewFactory=async()=>current
    const first=await createAdminAdSimulation(adminA,campaignId,'SIMULATE '+campaignId,{clientFactory,previewFactory})
    assert.equal(first.existing,false)
    assert.equal(first.revision,1)
    const same=await createAdminAdSimulation(adminA,campaignId,'SIMULATE '+campaignId,{clientFactory,previewFactory})
    assert.equal(same.existing,true)
    assert.equal(same.id,first.id)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_settlement_simulations')).rows[0].n,1)
    const inspect=await adminAdSimulationDetail(first.id,{query:db.query.bind(db)})
    assert.equal(inspect.simulation.lines.length,3)
    assert.equal(inspect.can_post_wallet,false)
    await assert.rejects(()=>reviewAdminAdSimulation(adminA,first.id,'reviewed_for_testing',
      'Self verification attempt',{clientFactory}),e=>e.status===403)
    await reviewAdminAdSimulation(adminA,first.id,'dispute','Evidence requires manual investigation',{clientFactory})
    await reviewAdminAdSimulation(adminB,first.id,'reviewed_for_testing','Second administrator checked test figures',{clientFactory})
    const listed=await adminAdSimulationList(campaignId,{query:db.query.bind(db)})
    assert.equal(listed.simulations.length,1)
    assert.equal(listed.simulations[0].latest_review,'reviewed_for_testing')
    current=candidate(campaignId,owner,adminA,false)
    const changed=await createAdminAdSimulation(adminA,campaignId,'SIMULATE '+campaignId,{clientFactory,previewFactory})
    assert.equal(changed.revision,2)
    assert.notEqual(changed.fingerprint,first.fingerprint)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_settlement_simulation_lines WHERE simulation_id=$1',[changed.id])).rows[0].n,3)
    await assert.rejects(()=>db.query('UPDATE ad_settlement_simulations SET revision=99 WHERE id=$1',[first.id]))
    await assert.rejects(()=>db.query('DELETE FROM ad_settlement_simulation_reviews WHERE simulation_id=$1',[first.id]))
    assert.equal((await db.query('SELECT balance::text FROM wallets WHERE user_id=$1',[owner])).rows[0].balance,'12345')
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n,0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_campaign_settlements')).rows[0].n,0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_accounting_entries')).rows[0].n,0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_reward_allocations')).rows[0].n,0)
    process.env.VERCEL_ENV='production'
    assert.equal(simulationWritable(),false)
    await assert.rejects(()=>createAdminAdSimulation(adminA,campaignId,'SIMULATE '+campaignId,
      {clientFactory,previewFactory}),e=>e.status===403)
  }finally{
    delete global.__tworldPool
    for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v}
    await db.close()
  }
})
