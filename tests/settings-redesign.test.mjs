import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const migration=read('db/patch-subscriber-content-privacy-2026-10.sql')
const settings=read('src/pages/Settings.jsx')
const wallet=read('src/pages/Wallet.jsx')
const profile=read('src/components/profile/ProfileHeader.jsx')

global.__tworldPool ??= {query:async()=>({rows:[]})}
const {getContentPrivacy,updateContentPrivacy,assertShowroomInquiryAllowed,assertVibesCommentAllowed}=
  await import('../api/_lib/contentPrivacy.js')

test('five settings sections are mobile-visible without global search or duplicate account information',()=>{
  assert.match(settings,/grid grid-cols-3 gap-2 sm:grid-cols-5/)
  for(const term of ["'general','General'","'notifications','Notifications'","'privacy','Privacy'","'security','Security'","'wallet','Wallet'"])
    assert.ok(settings.includes(term))
  assert.doesNotMatch(settings,/CompactPageHeader|Account information|Edit profile|Membership & verification|Open notifications inbox|Text-only browsing|Sign out/)
  assert.match(profile,/isOwner&&<div[\s\S]*?Private account information/)
  assert.match(settings,/Offline Vibes videos/)
})

test('notifications contain simple preference rows and no Audio Money copy',()=>{
  const source=read('src/components/PushNotificationSettings.jsx')
  assert.doesNotMatch(source,/Audio Money|Bento Field and Audio Money|rounded-\[22px\] border-\[1.5px\]/)
  assert.match(source,/Payments & Wallet/)
  assert.match(source,/divide-y divide-black\/10/)
})

test('wallet balance preference is local per user, hides transaction amounts and has an eye control',async()=>{
  const {getWalletBalanceVisible,setWalletBalanceVisible}=await import('../src/lib/walletBalancePreference.js')
  const values=new Map()
  global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}
  global.window={dispatchEvent:()=>{}}
  global.CustomEvent=class{constructor(name,options){this.type=name;this.detail=options.detail}}
  try{
    assert.equal(getWalletBalanceVisible('a'),false)
    setWalletBalanceVisible('a',true)
    assert.equal(getWalletBalanceVisible('a'),true)
    assert.equal(getWalletBalanceVisible('b'),false)
    setWalletBalanceVisible('a',false)
    assert.equal(getWalletBalanceVisible('a'),false)
    assert.match(wallet,/Show wallet balance|Hide wallet balance/)
    assert.match(wallet,/balanceVisible\?fmtMoney\(t.amount\):'••••'/)
    assert.match(settings,/useWalletBalanceVisible\(user\?\.id\)/)
  }finally{delete global.localStorage;delete global.window;delete global.CustomEvent}
})

test('migration stores independent authenticated policies; old deployments can still read defaults',async()=>{
  assert.match(migration,/showroom_inquiries TEXT NOT NULL DEFAULT 'everyone'/)
  assert.match(migration,/vibes_comments TEXT NOT NULL DEFAULT 'everyone'/)
  const q=async sql=>({rows:[{relation:null}]})
  assert.deepEqual(await getContentPrivacy('alice',q),{
    installed:false,showroom_inquiries:'everyone',vibes_comments:'everyone'})
  await assert.rejects(()=>updateContentPrivacy('alice','unexpected','nobody',q),{status:400})
  await assert.rejects(()=>updateContentPrivacy('alice','vibes_comments','nobody',q),{status:503})
  const calls=[]
  const update=async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('to_regclass')
    ?[{relation:'subscriber_content_privacy'}]:[{showroom_inquiries:'everyone',vibes_comments:'nobody'}]}}
  assert.equal((await updateContentPrivacy('alice','vibes_comments','nobody',update)).vibes_comments,'nobody')
  assert.deepEqual(calls.at(-1).args,['alice','nobody'])
  assert.ok(!calls.at(-1).sql.includes('DELETE'))
})

test('new booking guards verified clients; Vibes comments require accepted Associates if restricted',async()=>{
  const q=async(sql,args)=>{
    if(sql.includes('to_regclass'))return {rows:[{relation:sql.includes('associate_links')?'associate_links':'subscriber_content_privacy'}]}
    if(sql.includes('SELECT showroom_inquiries'))return {rows:[{showroom_inquiries:'verified_clients',vibes_comments:'associates'}]}
    if(sql.includes('SELECT role'))return {rows:[{role:'client',verified:false}]}
    if(sql.includes('SELECT status FROM associate_links'))return {rows:[]}
    return {rows:[]}
  }
  await assert.rejects(()=>assertShowroomInquiryAllowed('talent','unverified',q),{status:403})
  await assert.rejects(()=>assertVibesCommentAllowed('author','stranger',q),{status:403})
  await assert.doesNotReject(()=>assertVibesCommentAllowed('author','author',q))
  const verified=async(sql,args)=>sql.includes('SELECT role')?{rows:[{role:'dual',verified:true}]}:q(sql,args)
  await assert.doesNotReject(()=>assertShowroomInquiryAllowed('talent','business',verified))
  const associate=async(sql,args)=>sql.includes('SELECT status FROM associate_links')
    ?{rows:[{status:'accepted'}]}:q(sql,args)
  await assert.doesNotReject(()=>assertVibesCommentAllowed('author','associate',associate))
  const blocked=async(sql,args)=>sql.includes('SELECT status FROM associate_links')
    ?{rows:[{status:'blocked'}]}:q(sql,args)
  await assert.rejects(()=>assertVibesCommentAllowed('author','blocked',blocked),{status:403})
})

test('privacy policy blocks only NEW hiring requests and newly created replies',()=>{
  const escrow=read('api/escrows/index.js')
  const employment=read('api/_lib/employment.js')
  const vibes=read('api/vibes/index.js')
  assert.match(escrow,/if \(!escrow\) \{\s*await assertShowroomInquiryAllowed/)
  assert.match(employment,/employment_create[\s\S]*?assertShowroomInquiryAllowed/)
  assert.match(vibes,/await assertVibesCommentAllowed/)
  assert.match(settings,/getContentPrivacy\(\)/)
  assert.match(settings,/updateContentPrivacy\(field,value\)/)
})
