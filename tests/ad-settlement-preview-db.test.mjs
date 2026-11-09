import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

test('admin preview reads only mutually verified Discovery/Explorer evidence and never posts wallets',async()=>{
  const db=new PGlite()
  const owner=randomUUID(),viewer=randomUUID(),hat=randomUUID(),advertiser=randomUUID(),
    campaign=randomUUID(),creative=randomUUID(),terms=randomUUID(),session=randomUUID()
  const end=new Date(Date.now()-3600*1000)
  const start=new Date(end.getTime()-30*86400*1000)
  const before=new Date(start.getTime()-5*86400*1000)
  const during=new Date(start.getTime()+5*86400*1000)
  try{
    await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,role TEXT NOT NULL);
      CREATE TABLE hats(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),role TEXT NOT NULL,active BOOLEAN DEFAULT TRUE);
      INSERT INTO users(id,role) VALUES ('${owner}','talent'),('${viewer}','client');
      INSERT INTO hats(id,user_id,role) VALUES ('${hat}','${owner}','talent');`)
    for(const file of ['patch-ad-finance-foundation-2026-11.sql','patch-ad-campaign-management-2026-11.sql',
      'patch-ad-sponsored-slots-2026-11.sql','patch-orbit-verified-2026-11.sql','patch-orbit-explorer-proof-2026-11.sql']){
      await db.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'))
    }
    await db.query("INSERT INTO ad_advertisers(id,owner_id,legal_name,status) VALUES($1,$2,'Example Advertiser','approved')",[advertiser,owner])
    await db.query(`INSERT INTO ad_campaigns(id,advertiser_id,title,state,start_at,end_at)
       VALUES($1,$2,'Verified Demo','verifying',$3,$4)`,[campaign,advertiser,start.toISOString(),end.toISOString()])
    await db.query(`INSERT INTO ad_campaign_terms(id,campaign_id,version,metric,unit_price_naira,budget_cap_naira,approved_by,approved_at,accepted_at)
       VALUES($1,$2,1,'qualified_click',250000,500000,$3,now(),now())`,[terms,campaign,owner])
    await db.query(`INSERT INTO ad_funding_receipts(campaign_id,provider,provider_reference,amount_naira,status,verified_at)
       VALUES($1,'test','mock-funding',500000,'verified',now())`,[campaign])
    await db.query(`INSERT INTO ad_billable_events(campaign_id,terms_id,event_reference,event_type,actor_id,verified_at,created_at)
       VALUES($1,$2,'demo-click','qualified_click',$3,now(),$4)`,[campaign,terms,viewer,during.toISOString()])
    await db.query(`INSERT INTO ad_creatives(id,campaign_id,media_type,media_url,state)
       VALUES($1,$2,'image','https://res.cloudinary.com/demo/image/upload/v1/advert.jpg','approved')`,[creative,campaign])
    await db.query(`INSERT INTO ad_talent_ad_policy(user_id,policy_version,accepted_at)
       VALUES($1,'ad-auto-2026-11-v1',$2)`,[owner,before.toISOString()])
    await db.query(`INSERT INTO ad_hat_placements(campaign_id,creative_id,hat_id,state,starts_at,ends_at)
       VALUES($1,$2,$3,'expired',$4,$5)`,[campaign,creative,hat,start.toISOString(),end.toISOString()])
    await db.query(`INSERT INTO orbit_discovery_sessions(id,viewer_id,talent_id,hat_id,opened_at,expires_at,state)
       VALUES($1,$2,$3,$4,$5,$6,'awarded')`,
      [session,viewer,owner,hat,before.toISOString(),new Date(before.getTime()+10*60000).toISOString()])
    await db.query(`INSERT INTO orbit_verified_events(actor_id,subject_id,beneficiary_id,lane,verb,source_type,source_id,points,status,created_at)
      VALUES($1,$2,$2,'talent','Discover','discovery',$3,1,'verified',$4),
            ($1,$2,$1,'client','Explorer','discovery',$3,1,'verified',$4)`,[viewer,owner,session,before.toISOString()])
    global.__tworldPool={query:(sql,params)=>db.query(sql,params)}
    const {adminAdvertisingSettlementPreview}=await import('../api/_lib/adSettlementPreview.js')
    const result=await adminAdvertisingSettlementPreview(campaign)
    assert.equal(result.eligible_talents,1)
    assert.equal(result.qualified_discovery_slots,1)
    assert.equal(result.candidate_earned_na,'250000')
    assert.equal(result.preview.pools.platform,'150000')
    assert.equal(result.preview.pools.talent,'70000')
    assert.equal(result.preview.pools.explorer,'30000')
    assert.equal(result.preview.explorer.recipients[0].recipientId,viewer)
    assert.equal(result.preview.explorer.recipients[0].amountNa,'30000')
    assert.equal(result.payouts_enabled,false)
    assert.equal(result.can_settle,false)
    assert.equal(result.can_post_wallet,false)
    assert.ok(result.blockers.length>0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_reward_allocations')).rows[0].n,0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_campaign_settlements')).rows[0].n,0)
    await db.query("UPDATE orbit_verified_events SET status='revoked' WHERE verb='Explorer' AND source_id=$1",[session])
    const updated=await adminAdvertisingSettlementPreview(campaign)
    assert.equal(updated.qualified_discovery_slots,0)
    assert.equal(updated.preview.explorer.unallocated,'30000')
  } finally{
    delete global.__tworldPool
    await db.close()
  }
})
