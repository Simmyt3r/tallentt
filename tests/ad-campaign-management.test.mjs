import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {validateAdvertiserName,validateCampaignDraft,validateCreative,validateReview} from '../shared/adCampaignRules.js'

test('advertiser and campaign fields reject malformed or unsafe data',()=>{
  assert.equal(validateAdvertiserName('  Better Hats Ltd  '),'Better Hats Ltd')
  assert.throws(()=>validateAdvertiserName(' '),/2–180/)
  assert.deepEqual(validateCampaignDraft({title:'Sponsored cloth',location:'Abuja',work_type:'Tailoring'}),
    {title:'Sponsored cloth',location:'Abuja',workType:'Tailoring'})
  assert.throws(()=>validateCampaignDraft({title:'x'}),/2–180/)
  assert.throws(()=>validateCampaignDraft({title:'Fine',location:5}),/required/)
})
test('creative must use app Cloudinary host, resource type and configured cloud',()=>{
  const good='https://res.cloudinary.com/chombutar-demo/image/upload/v184/ads/banner.jpg'
  assert.equal(validateCreative({media_type:'image',media_url:good},'chombutar-demo').url,good)
  for(const url of [
    'https://evil.example/img.jpg','http://res.cloudinary.com/chombutar-demo/image/upload/v1/x.jpg',
    'https://res.cloudinary.com/other/image/upload/v1/x.jpg',
    'https://res.cloudinary.com/chombutar-demo/video/upload/v1/x.mp4',
    'https://res.cloudinary.com/chombutar-demo/image/upload/v1/x.jpg?redirect=https://evil.example',
  ])assert.throws(()=>validateCreative({media_type:'image',media_url:url},'chombutar-demo'))
  assert.throws(()=>validateCreative({media_type:'video',media_url:good},''),/not configured/)
})
test('editorial review requires an explicit rejection reason',()=>{
 const id='11111111-1111-4111-8111-111111111111'
 assert.equal(validateReview({kind:'campaign',id,decision:'approved'}).note,'')
 assert.throws(()=>validateReview({kind:'advertiser',id,decision:'rejected',note:'Bad'}),/8 characters/)
 assert.throws(()=>validateReview({kind:'campaign',id:'invalid',decision:'approved'}),/identifier/)
})
test('advertising migrations add isolated tables without touching existing wallets or deals',async()=>{
 const db=new PGlite()
 try{
  await db.exec('CREATE TABLE users (id UUID PRIMARY KEY);')
  for(const file of ['patch-ad-finance-foundation-2026-11.sql','patch-ad-campaign-management-2026-11.sql']){
    const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8')
    await db.exec(sql)
  }
  const {rows}=await db.query(`SELECT to_regclass('ad_advertisers') IS NOT NULL AS advertisers,
    to_regclass('ad_campaigns') IS NOT NULL AS campaigns,
    to_regclass('ad_creatives') IS NOT NULL AS creatives,
    to_regclass('ad_review_history') IS NOT NULL AS reviews,
    to_regclass('wallets') IS NULL AS no_new_wallet`)
  assert.deepEqual(Object.values(rows[0]),[true,true,true,true,true])
  const user='11111111-1111-4111-8111-111111111111'
  await db.query('INSERT INTO users(id) VALUES($1)',[user])
  await db.query("INSERT INTO ad_advertisers(owner_id,legal_name) VALUES($1,'Amaka Studio')",[user])
  await assert.rejects(()=>db.query("INSERT INTO ad_advertisers(owner_id,legal_name) VALUES($1,'amaka studio')",[user]))
 }finally{await db.close()}
})
