import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'
import {guestDiscovery} from '../api/_lib/guestDiscovery.js'
import {guestAuthUrl,guestResumePath,parseGuestResume,safeAuthReturnPath} from '../src/lib/guestIntent.js'

let db,pool,goodTalent,client,goodHat,hiddenHat,pendingHat,post,oldViews
before(async()=>{
  db=await testDatabase();pool=db.pool;global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  goodTalent=randomUUID();client=randomUUID();goodHat=randomUUID()
  hiddenHat=randomUUID();pendingHat=randomUUID();post=randomUUID()
  await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash,role,country,lga,bank_name)
    VALUES($1,'Amaka','amaka_guest','amaka@example.test','secret','talent','Nigeria','Abuja','PRIVATE BANK'),
      ($2,'Ziva','ziva_guest','ziva@example.test','secret','client','Nigeria','Abuja','PRIVATE BANK')`,
    [goodTalent,client])
  await pool.query(`INSERT INTO hats(id,user_id,hat_title,hat_name,username,category,role,rate,active,feed_visible,lga)
    VALUES($1,$2,'Fine Hat','Fine Hat','amaka_guest','Tailoring','talent',25000,TRUE,TRUE,'Abuja'),
      ($3,$2,'Draft Hat','Draft Hat','amaka_guest','Tailoring','talent',1000,TRUE,FALSE,'Abuja'),
      ($4,$2,'Held Hat','Held Hat','amaka_guest','Tailoring','talent',1000,TRUE,TRUE,'Abuja')`,
    [goodHat,goodTalent,hiddenHat,pendingHat])
  await pool.query(`INSERT INTO hat_media(hat_id,url,public_id,type,screening_status) VALUES
    ($1,'https://res.cloudinary.com/demo/image/upload/v1/good.jpg','good','image','passed'),
    ($2,'https://res.cloudinary.com/demo/image/upload/v1/pending.jpg','pending','image','held')`,
    [goodHat,pendingHat])
  await pool.query(`INSERT INTO vibes_posts(id,author_id,body,media,moderation_status)
    VALUES($1,$2,'Amaka made a fine hat','[]'::jsonb,'visible')`,[post,goodTalent])
  oldViews=(await pool.query('SELECT views FROM hats WHERE id=$1',[goodHat])).rows[0].views
})
after(async()=>{await db?.close();delete global.__tworldPool})
test('guest sees only public approved Talent Hats, with an explicit field whitelist',async()=>{
  const list=await guestDiscovery({mode:'showroom'})
  assert.equal(list.hats.some(h=>h.id===goodHat),true)
  assert.equal(list.hats.some(h=>h.id===pendingHat),false)
  assert.equal(list.hats.some(h=>h.id===hiddenHat),false)
  const card=list.hats.find(h=>h.id===goodHat)
  assert.equal(card.hat_title,'Fine Hat')
  assert.equal(card.media.length,1)
  assert.equal('bank_name' in card,false)
  assert.equal('password_hash' in card,false)
  assert.equal('email' in card,false)
  assert.equal('nin_hash' in card,false)
  assert.equal(card.lga,'Abuja')
  assert.equal(typeof card.orbit_score,'number')
})
test('guest Bento honors feed opt-in, searches by Talent and has location filter',async()=>{
  const list=await guestDiscovery({mode:'bento',search:'fine',city:'ABUJA'})
  assert.deepEqual(list.hats.map(h=>h.id),[goodHat])
  assert.equal((await guestDiscovery({mode:'bento',city:'Lagos'})).hats.length,0)
  assert.equal((await guestDiscovery({mode:'bento',search:'nomatch'})).hats.length,0)
})
test('guest Vibes shows only public posts from Talent without private author columns',async()=>{
  const list=await guestDiscovery({mode:'vibes'})
  assert.equal(list.posts.some(p=>p.id===post),true)
  const item=list.posts.find(p=>p.id===post)
  assert.equal(item.owner_full_name,'Amaka')
  assert.equal('email' in item,false)
  assert.equal('bank_name' in item,false)
  await pool.query("UPDATE vibes_posts SET moderation_status='held' WHERE id=$1",[post])
  const held=await guestDiscovery({mode:'vibes'})
  assert.equal(held.posts.some(p=>p.id===post),false)
})
test('guest searches and media views have no write effects on Orbit, views or follows',async()=>{
  await guestDiscovery({mode:'showroom',search:'Fine'})
  await guestDiscovery({mode:'bento',username:'amaka_guest'})
  const afterView=(await pool.query('SELECT views FROM hats WHERE id=$1',[goodHat])).rows[0].views
  assert.equal(afterView,oldViews)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM hat_likes')).rows[0].n,0)
  const presence=(await pool.query("SELECT to_regclass('subscriber_follows') AS follows")).rows[0]
  if(presence.follows)assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM subscriber_follows')).rows[0].n,0)
})
test('invalid public search arguments are rejected',async()=>{
  await assert.rejects(guestDiscovery({mode:'private'}),/public discovery view/)
  await assert.rejects(guestDiscovery({mode:'bento',page:-1}),/Invalid discovery page/)
  await assert.rejects(guestDiscovery({mode:'showroom',id:'not-a-uuid'}),/Invalid Hat/)
  await assert.rejects(guestDiscovery({mode:'showroom',username:'../../secrets'}),/Invalid Talent/)
})
test('return destinations preserve a Talent without open redirect, protocol or duplicate params',()=>{
  const intent={intent:'keepup',username:'amaka_guest',hat:goodHat}
  const target=guestResumePath(intent)
  assert.deepEqual(parseGuestResume(target),{...intent,resource:'hat'})
  assert.equal(safeAuthReturnPath(target),target)
  assert.match(guestAuthUrl('signup',intent),/^\/auth\?mode=signup&next=/)
  assert.equal(safeAuthReturnPath('https://evil.example/'),null)
  assert.equal(safeAuthReturnPath('//evil.example/'),null)
  assert.equal(safeAuthReturnPath('/guest-resume?intent=keepup&username=amaka_guest&username=ziva_guest'),null)
  assert.equal(safeAuthReturnPath('/guest-resume?intent=book&username=amaka_guest&hat=../../admin'),null)
  assert.equal(safeAuthReturnPath('/admin'),null)
  const vibe=guestResumePath({intent:'comment',username:'amaka_guest',hat:post,resource:'vibe'})
  assert.equal(parseGuestResume(vibe).resource,'vibe')
  assert.equal(parseGuestResume(guestResumePath({intent:'book',username:'amaka_guest'})).hat,null)
})
