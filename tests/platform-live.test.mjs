import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {testDatabase} from './database.mjs'

const host=randomUUID(),viewer=randomUUID(),client=randomUUID()
let db,live,platform,room
test.before(async()=>{
  db=await testDatabase();global.__tworldPool=db.pool
  process.env.LIVE_VIDEO_PROVIDER='platform'
  await db.pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  await db.pool.query(await readFile(new URL('../db/live-support.sql',import.meta.url),'utf8'))
  for(const [id,name,role] of [[host,'host','talent'],[viewer,'viewer','talent'],[client,'client','client']])
    await db.pool.query(`INSERT INTO users(id,full_name,username,email,password_hash,role,is_admin)
      VALUES($1,$2,$2,$3,'test-only',$4,false)`,[id,name,`${name}@example.test`,role])
  live=await import('../api/_lib/live.js');platform=await import('../api/_lib/platformLive.js')
})
test.after(async()=>{await db?.close()})
const clip=sequence=>({stream_id:room.id,sequence,mime_type:'video/webm;codecs=vp8,opus',duration_ms:2000,
  media:Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.alloc(64)]).toString('base64')})

test('non-admin talent can create an app broadcast without any media service',async()=>{
  await assert.rejects(live.createStream(client,{title:'Test',category:'Music'}),{status:403})
  const created=await live.createStream(host,{title:'Camera test',category:'Music'})
  room=created.stream
  assert.equal(created.media_mode,'platform');assert.equal(room.status,'starting')
  assert.equal(room.hls_url,null);assert.equal(room.publish_token_hash,undefined)
  await assert.rejects(live.createStream(host,{title:'Second tab',category:'Music'}),{status:409})
  await assert.rejects(live.markStreamLive(host,{stream_id:room.id}),{status:409})
  await assert.rejects(live.publisherState(host,{stream_id:room.id,state:'connected'}),{status:409})
  assert.deepEqual(await platform.platformManifest(room.id),{status:'starting',segments:[]})
})
test('only owner video uploads start Live; invalid formats, sizes and sequence are rejected',async()=>{
  await assert.rejects(platform.uploadPlatformSegment(viewer,clip(1)),{status:403})
  await assert.rejects(platform.uploadPlatformSegment(host,{...clip(1),mime_type:'text/html'}),{status:400})
  await assert.rejects(platform.uploadPlatformSegment(host,{...clip(1),media:Buffer.alloc(786433).toString('base64')}),{status:413})
  await assert.rejects(platform.uploadPlatformSegment(host,{...clip(1),media:Buffer.alloc(64).toString('base64')}),{status:400})
  await assert.rejects(platform.uploadPlatformSegment(host,clip(2)),{status:409})
  const posted=await platform.uploadPlatformSegment(host,clip(1))
  assert.equal(posted.status,'live')
  const manifest=await platform.platformManifest(room.id)
  assert.equal(manifest.status,'live');assert.equal(manifest.segments[0].sequence,1)
  const video=await platform.platformSegment(room.id,1)
  assert.equal(video.media.toString('base64'),clip(1).media)
  await assert.rejects(platform.uploadPlatformSegment(host,clip(2)),{status:429})
})
test('retries do not duplicate video, storage is bounded and abandoned rooms expire',async()=>{
  assert.equal((await platform.uploadPlatformSegment(host,clip(1))).already_processed,true)
  await assert.rejects(platform.uploadPlatformSegment(host,{...clip(1),duration_ms:2100}),{status:409})
  for(let seq=2;seq<=10;seq++){
    await db.pool.query("UPDATE live_video_segments SET created_at=NOW()-INTERVAL '2 seconds' WHERE stream_id=$1",[room.id])
    await platform.uploadPlatformSegment(host,clip(seq))
  }
  const manifest=await platform.platformManifest(room.id)
  assert.equal(manifest.segments.length,8);assert.equal(manifest.segments[0].sequence,3)
  await db.pool.query("UPDATE live_streams SET last_media_event_at=NOW()-INTERVAL '20 seconds' WHERE id=$1",[room.id])
  assert.equal((await platform.platformManifest(room.id)).status,'reconnecting')
  await db.pool.query("UPDATE live_streams SET last_media_event_at=NOW()-INTERVAL '46 seconds' WHERE id=$1",[room.id])
  assert.deepEqual(await platform.platformManifest(room.id),{status:'ended',segments:[]})
  await assert.rejects(platform.platformSegment(room.id,10),{status:404})
  await assert.rejects(platform.uploadPlatformSegment(host,clip(11)),{status:409})
})
test('ending Live removes its video and rejects further access',async()=>{
  room=(await live.createStream(host,{title:'End test',category:'Music'})).stream
  await platform.uploadPlatformSegment(host,clip(1))
  await assert.rejects(live.endStream(viewer,{stream_id:room.id}),{status:404})
  await live.endStream(host,{stream_id:room.id})
  assert.equal((await db.pool.query('SELECT * FROM live_video_segments WHERE stream_id=$1',[room.id])).rows.length,0)
  await assert.rejects(platform.platformSegment(room.id,1),{status:404})
})
