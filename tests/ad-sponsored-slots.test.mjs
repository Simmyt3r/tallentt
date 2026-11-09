import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const user='11111111-1111-4111-8111-111111111111'
const hat='22222222-2222-4222-8222-222222222222'
const creative='33333333-3333-4333-8333-333333333333'
const advertiser='44444444-4444-4444-8444-444444444444'
const campaign='55555555-5555-4555-8555-555555555555'
async function setup(){
  const db=new PGlite()
  await db.exec(`CREATE TABLE users(id uuid primary key, role text not null);
    CREATE TABLE hats(id uuid primary key, user_id uuid references users(id), role text not null,active boolean not null default true);
    INSERT INTO users(id,role) VALUES('${user}','talent');
    INSERT INTO hats(id,user_id,role) VALUES('${hat}','${user}','talent');`)
  for(const file of ['patch-ad-finance-foundation-2026-11.sql','patch-ad-campaign-management-2026-11.sql','patch-ad-sponsored-slots-2026-11.sql']){
    await db.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'))
  }
  return db
}
test('sponsor placement migration installs disabled-by-default inventory without wallet changes',async()=>{
  const db=await setup()
  try{
    await db.query('INSERT INTO ad_advertisers(id,owner_id,legal_name,status) VALUES($1,$2,$3,$4)',
      [advertiser,user,'Amaka Fashion','approved'])
    await db.query('INSERT INTO ad_campaigns(id,advertiser_id,title) VALUES($1,$2,$3)',
      [campaign,advertiser,'Campaign for Fashion'])
    await db.query('INSERT INTO ad_creatives(id,campaign_id,media_type,media_url,caption,state) VALUES($1,$2,$3,$4,$5,$6)',
      [creative,campaign,'image','https://res.cloudinary.com/demo/image/upload/v1/sponsor.png','Fashion materials','approved'])
    const result=await db.query('SELECT delivery_enabled FROM ad_campaigns WHERE id=$1',[campaign])
    assert.equal(result.rows[0].delivery_enabled,false)
    assert.equal((await db.query("SELECT to_regclass('wallets') AS wallets")).rows[0].wallets,null)
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM ad_talent_ad_policy')).rows[0].count,0)
    await assert.rejects(()=>db.query(`INSERT INTO ad_hat_placements(campaign_id,creative_id,hat_id,starts_at,ends_at)
      VALUES($1,$2,$3,now(),now()+INTERVAL '31 days')`,[campaign,creative,hat]))
    const inserted=await db.query(`INSERT INTO ad_hat_placements(campaign_id,creative_id,hat_id,starts_at,ends_at)
      VALUES($1,$2,$3,now(),now()+INTERVAL '30 days') RETURNING id,state`,[campaign,creative,hat])
    assert.equal(inserted.rows[0].state,'reserved')
    await assert.rejects(()=>db.query("UPDATE ad_hat_placements SET state='detached' WHERE id=$1",[inserted.rows[0].id]))
    await db.query("UPDATE ad_hat_placements SET state='detached',detached_at=now() WHERE id=$1",[inserted.rows[0].id])
    await db.query('INSERT INTO ad_placement_detachments(placement_id,talent_id) VALUES($1,$2)',[inserted.rows[0].id,user])
    await assert.rejects(()=>db.query('INSERT INTO ad_placement_detachments(placement_id,talent_id) VALUES($1,$2)',[inserted.rows[0].id,user]))
    await assert.rejects(()=>db.query(`INSERT INTO ad_hat_placements(campaign_id,creative_id,hat_id,starts_at,ends_at)
      VALUES($1,$2,$3,now(),now()+INTERVAL '2 days')`,[campaign,creative,hat]))
  }finally{await db.close()}
})
test('Talent ad policy requires an explicit versioned acceptance record',async()=>{
  const db=await setup()
  try{
    await db.query('INSERT INTO ad_talent_ad_policy(user_id,policy_version) VALUES($1,$2)',[user,'ad-auto-2026-11-v1'])
    const r=await db.query('SELECT policy_version,accepted_at FROM ad_talent_ad_policy WHERE user_id=$1',[user])
    assert.equal(r.rows[0].policy_version,'ad-auto-2026-11-v1')
    assert.ok(r.rows[0].accepted_at)
    await assert.rejects(()=>db.query('INSERT INTO ad_talent_ad_policy(user_id,policy_version) VALUES($1,$2)',[user,'same']))
  }finally{await db.close()}
})
test('feature remains disabled without an explicit deployment enablement',async()=>{
  const source=await readFile(new URL('../api/_lib/adPlacements.js',import.meta.url),'utf8')
  assert.match(source,/CHOMBUTAR_AD_DELIVERY_ENABLED==='true'/)
  assert.match(source,/if\(!deliveryEnabled\(\)\)return \{placements:\{\},enabled:false\}/)
  assert.match(source,/c\.delivery_enabled=TRUE/)
  assert.match(source,/policy\.accepted_at IS NOT NULL/)
  assert.match(source,/f\.status='verified'/)
})
