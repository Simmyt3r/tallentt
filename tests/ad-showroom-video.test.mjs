import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {canOfferShowroomAd,SHOWROOM_AD_POLICY,trustedShowroomVideoUrl} from '../shared/showroomAdPolicy.js'

test('video ad cadence requires four unique posts, max two per browser session, no Top 12 or searching',()=>{
  const eligible={enabled:true,view:'for_you',postCount:4,shownCount:0,lastShownAt:0,
    isVisible:true,eligibleHat:true}
  assert.equal(canOfferShowroomAd(eligible),true)
  for(const override of [{postCount:3},{view:'top12'},{hasSearch:true},{isVisible:false},
    {hasDialog:true},{hasActiveAd:true},{eligibleHat:false},{alreadyAttempted:true},
    {shownCount:2},{postCount:7,shownCount:1,lastShownAt:4},{enabled:false}]){
    assert.equal(canOfferShowroomAd({...eligible,...override}),false,JSON.stringify(override))
  }
  assert.equal(canOfferShowroomAd({...eligible,postCount:8,shownCount:1,lastShownAt:4}),true)
  assert.equal(SHOWROOM_AD_POLICY.skipAfterSeconds,5)
  assert.equal(SHOWROOM_AD_POLICY.maximumPlaybackSeconds,15)
  assert.equal(SHOWROOM_AD_POLICY.maximumAdsPerSession,2)
})
test('video URL must be a configured Cloudinary video upload, never an arbitrary host',()=>{
  const good='https://res.cloudinary.com/chombutar-demo/video/upload/v123/ad-clip.mp4'
  assert.equal(trustedShowroomVideoUrl(good,'chombutar-demo'),true)
  for(const url of [
    'http://res.cloudinary.com/chombutar-demo/video/upload/v123/ad-clip.mp4',
    'https://external.example/advert.mp4',
    'https://res.cloudinary.com/other/video/upload/v123/ad-clip.mp4',
    'https://res.cloudinary.com/chombutar-demo/image/upload/v123/ad-clip.mp4',
    'https://res.cloudinary.com/chombutar-demo/video/upload/v123/ad-clip.mp4?track=1',
    'https://res.cloudinary.com/chombutar-demo/video/upload/%2F.mp4',
  ])assert.equal(trustedShowroomVideoUrl(url,'chombutar-demo'),false,url)
  assert.equal(trustedShowroomVideoUrl(good,''),false)
})

test('video placement endpoint remains preview-only and rejects unfunded/unapproved/detached placements',async()=>{
  const db=new PGlite(),user=randomUUID(),hat=randomUUID(),advertiser=randomUUID(),campaign=randomUUID(),creative=randomUUID(),terms=randomUUID()
  const keys=['CHOMBUTAR_AD_DELIVERY_ENABLED','CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED','VERCEL_ENV','CLOUDINARY_CLOUD_NAME']
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  try{
    await db.exec(`CREATE TABLE users(id UUID PRIMARY KEY,role TEXT NOT NULL);
      CREATE TABLE hats(id UUID PRIMARY KEY,user_id UUID REFERENCES users(id),role TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,feed_visible BOOLEAN NOT NULL DEFAULT TRUE);
      CREATE TABLE hat_media(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),hat_id UUID REFERENCES hats(id),
        screening_status TEXT NOT NULL DEFAULT 'passed');
      INSERT INTO users(id,role) VALUES('${user}','talent');
      INSERT INTO hats(id,user_id,role) VALUES('${hat}','${user}','talent');
      INSERT INTO hat_media(hat_id) VALUES('${hat}');`)
    for(const p of ['patch-ad-finance-foundation-2026-11.sql','patch-ad-campaign-management-2026-11.sql',
      'patch-ad-sponsored-slots-2026-11.sql']){
      await db.exec(await readFile(new URL('../db/'+p,import.meta.url),'utf8'))
    }
    await db.query(`INSERT INTO ad_advertisers(id,owner_id,legal_name,status)
      VALUES($1,$2,'Example sponsor','approved')`,[advertiser,user])
    await db.query(`INSERT INTO ad_campaigns(id,advertiser_id,title,state,delivery_enabled,start_at,end_at)
      VALUES($1,$2,'Preview only','active',TRUE,now()-interval '1 day',now()+interval '1 day')`,[campaign,advertiser])
    await db.query(`INSERT INTO ad_creatives(id,campaign_id,media_type,media_url,state)
      VALUES($1,$2,'video',$3,'approved')`,[creative,campaign,'https://res.cloudinary.com/chombutar-demo/video/upload/v1/test.mp4'])
    await db.query(`INSERT INTO ad_campaign_terms(id,campaign_id,version,metric,unit_price_naira,budget_cap_naira,approved_by,approved_at,accepted_at)
      VALUES($1,$2,1,'qualified_click',10,200,$3,now()-interval '2 days',now()-interval '2 days')`,[terms,campaign,user])
    await db.query(`INSERT INTO ad_funding_receipts(campaign_id,provider,provider_reference,amount_naira,status,verified_at)
      VALUES($1,'test','demo-preview',200,'verified',now()-interval '2 days')`,[campaign])
    await db.query("INSERT INTO ad_talent_ad_policy(user_id,policy_version) VALUES($1,'ad-auto-2026-11-v1')",[user])
    const {rows:placements}=await db.query(`INSERT INTO ad_hat_placements(campaign_id,creative_id,hat_id,state,starts_at,ends_at)
      VALUES($1,$2,$3,'active',now()-interval '1 day',now()+interval '1 day') RETURNING id`,[campaign,creative,hat])
    global.__tworldPool={query:db.query.bind(db)}
    const {publicShowroomVideoSlots}=await import('../api/_lib/adPlacements.js')
    process.env.VERCEL_ENV='preview'
    process.env.CLOUDINARY_CLOUD_NAME='chombutar-demo'
    delete process.env.CHOMBUTAR_AD_DELIVERY_ENABLED
    delete process.env.CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED
    assert.equal((await publicShowroomVideoSlots(hat)).enabled,false)
    process.env.CHOMBUTAR_AD_DELIVERY_ENABLED='true'
    process.env.CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED='true'
    const good=await publicShowroomVideoSlots(hat)
    assert.equal(good.enabled,true)
    assert.equal(good.billable,false)
    assert.equal(good.placements[hat].id,placements[0].id)
    process.env.VERCEL_ENV='production'
    assert.equal((await publicShowroomVideoSlots(hat)).enabled,false)
    process.env.VERCEL_ENV='preview'
    await db.query("UPDATE ad_creatives SET state='rejected' WHERE id=$1",[creative])
    assert.deepEqual((await publicShowroomVideoSlots(hat)).placements,{})
    await db.query("UPDATE ad_creatives SET state='approved' WHERE id=$1",[creative])
    await db.query("UPDATE ad_funding_receipts SET status='pending',verified_at=NULL WHERE campaign_id=$1",[campaign])
    assert.deepEqual((await publicShowroomVideoSlots(hat)).placements,{})
    await db.query("UPDATE ad_funding_receipts SET status='verified',verified_at=now() WHERE campaign_id=$1",[campaign])
    await db.query("UPDATE ad_hat_placements SET state='detached',detached_at=now() WHERE id=$1",[placements[0].id])
    assert.deepEqual((await publicShowroomVideoSlots(hat)).placements,{})
    await assert.rejects(()=>publicShowroomVideoSlots('bogus'),e=>e.status===400)
  }finally{
    delete global.__tworldPool
    for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}
    await db.close()
  }
})
test('Showroom player never auto-unmutes and is removed on inactive post',async()=>{
  const src=await readFile(new URL('../src/components/ShowroomVideoAd.jsx',import.meta.url),'utf8')
  const showroom=await readFile(new URL('../src/components/Showroom.jsx',import.meta.url),'utf8')
  assert.match(src,/muted playsInline autoPlay/)
  assert.match(src,/n>=SHOWROOM_AD_POLICY\.maximumPlaybackSeconds/)
  assert.match(src,/seconds>=SHOWROOM_AD_POLICY\.skipAfterSeconds/)
  assert.match(src,/onEnded=\{onDismiss\}/)
  assert.match(showroom,/view!=='top12'/)
  assert.match(showroom,/onVideoAdDismiss=\{onSponsorVideoDismiss\}/)
  assert.match(showroom,/playing=\{it\.key === activeKey.*sponsoredVideo/)
})
