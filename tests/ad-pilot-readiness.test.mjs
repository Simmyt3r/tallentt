import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {PILOT_SCHEMA,summarizeAdPilotReadiness} from '../shared/adPilotReadiness.js'

test('pilot readiness is never a real payment authorization even with all flags set',()=>{
  const tables=Object.fromEntries(PILOT_SCHEMA.map(name=>[name,true]))
  const report=summarizeAdPilotReadiness({tables,
    environment:{is_preview:true,banner_preview_flag:true,video_preview_flag:true,simulation_preview_flag:true}})
  assert.equal(report.schema.missing.length,0)
  assert.equal(report.paid_delivery_allowed,false)
  assert.equal(report.paid_campaign_activation_allowed,false)
  assert.equal(report.external_payment_verified,false)
  assert.equal(report.payouts_enabled,false)
  assert.equal(report.pilot_ready,false)
  assert.equal(report.preview_capabilities.every(x=>x.pass),true)
  assert.ok(report.blockers.some(x=>x.code==='EXTERNAL_FUNDING_UNVERIFIED'))
  const missing=summarizeAdPilotReadiness({tables:{},environment:{is_preview:false,banner_preview_flag:true}})
  assert.equal(missing.schema.missing.length,PILOT_SCHEMA.length)
  assert.equal(missing.preview_capabilities[0].pass,false)
})

test('Admin pilot report reads only schemas and aggregate counts, never edits a real balance',async()=>{
  const db=new PGlite()
  const owner=randomUUID(),advertiser=randomUUID(),campaign=randomUUID()
  const former=global.__tworldPool
  try{
    await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,role TEXT NOT NULL);
      CREATE TABLE hats(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),role TEXT NOT NULL,active BOOLEAN DEFAULT TRUE);
      CREATE TABLE wallets(user_id UUID PRIMARY KEY,balance BIGINT NOT NULL);
      INSERT INTO users(id,role) VALUES('${owner}','talent');
      INSERT INTO wallets(user_id,balance) VALUES('${owner}',25000);`)
    global.__tworldPool={query:db.query.bind(db)}
    const {adminAdvertisingPilotReadiness}=await import('../api/_lib/adPilotReadiness.js')
    const initial=await adminAdvertisingPilotReadiness({query:db.query.bind(db)},{VERCEL_ENV:'production',
      CHOMBUTAR_AD_DELIVERY_ENABLED:'true'})
    assert.equal(initial.schema.installed,0)
    assert.equal(initial.environment.is_preview,false)
    assert.equal(initial.paid_delivery_allowed,false)
    for(const p of ['patch-ad-finance-foundation-2026-11.sql','patch-ad-campaign-management-2026-11.sql',
      'patch-ad-sponsored-slots-2026-11.sql','patch-ad-settlement-simulation-2026-11.sql']){
      await db.exec(await readFile(new URL('../db/'+p,import.meta.url),'utf8'))
    }
    await db.query("INSERT INTO ad_advertisers(id,owner_id,legal_name,status) VALUES($1,$2,'Example business','approved')",[advertiser,owner])
    await db.query("INSERT INTO ad_campaigns(id,advertiser_id,title,state) VALUES($1,$2,'Nonfinancial test','approved')",[campaign,advertiser])
    const report=await adminAdvertisingPilotReadiness({query:db.query.bind(db)},{
      VERCEL_ENV:'preview',CHOMBUTAR_AD_DELIVERY_ENABLED:'true',
      CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED:'true',CHOMBUTAR_AD_SIMULATION_ENABLED:'true'})
    assert.equal(report.data_counts.approved_advertisers,1)
    assert.equal(report.data_counts.editorially_approved_campaigns,1)
    assert.equal(report.data_counts.test_simulations,0)
    assert.equal(report.schema.missing.includes('orbit_discovery_sessions'),true)
    assert.equal(report.external_payment_verified,false)
    assert.equal(report.payouts_enabled,false)
    assert.equal((await db.query('SELECT balance::text AS b FROM wallets WHERE user_id=$1',[owner])).rows[0].b,'25000')
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_campaign_settlements')).rows[0].n,0)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ad_accounting_entries')).rows[0].n,0)
  }finally{
    if(former===undefined)delete global.__tworldPool;else global.__tworldPool=former
    await db.close()
  }
})

test('production banner cannot become active from the legacy flag alone',async()=>{
  const prior=Object.fromEntries(['VERCEL_ENV','CHOMBUTAR_AD_DELIVERY_ENABLED'].map(k=>[k,process.env[k]]))
  const former=global.__tworldPool
  try{
    global.__tworldPool={query:async()=>{throw Error('Must not query DB while production ads disabled')}}
    const {deliveryEnabled,publicSponsoredSlots}=await import('../api/_lib/adPlacements.js')
    process.env.VERCEL_ENV='production'
    process.env.CHOMBUTAR_AD_DELIVERY_ENABLED='true'
    assert.equal(deliveryEnabled(),false)
    assert.deepEqual(await publicSponsoredSlots('anything'),{placements:{},enabled:false})
    process.env.VERCEL_ENV='preview'
    assert.equal(deliveryEnabled(),true)
    delete process.env.CHOMBUTAR_AD_DELIVERY_ENABLED
    assert.equal(deliveryEnabled(),false)
  }finally{
    if(former===undefined)delete global.__tworldPool;else global.__tworldPool=former
    for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  }
})
