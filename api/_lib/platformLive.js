// Short, independently playable camera segments use the existing app/database.
// No external media relay, stream key, public bucket or persistent socket needed.
import {query,getClient} from './db.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MIME=/^video\/(webm|mp4)(?:;\s*codecs=[a-zA-Z0-9., _"-]+)?$/
export const MAX_LIVE_SEGMENT_BYTES=768*1024
const fail=(status,message)=>Object.assign(new Error(message),{status})
export const isPlatformStream=stream=>String(stream?.stream_path||'').startsWith('app-')
function id(value){if(!UUID.test(String(value||'')))throw fail(400,'A valid stream_id is required.');return value}
function sequence(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Invalid video segment sequence.');return n}

let storage
export async function ensurePlatformLive(){
  if(!storage)storage=installStorage().catch(error=>{storage=null;throw error})
  await storage
}
async function installStorage(){
  if((await query("SELECT to_regclass('live_video_segments') AS installed")).rows[0]?.installed)return
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(176483,6)')
    await client.query(`CREATE TABLE IF NOT EXISTS live_video_segments (
    stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK(sequence>0), mime_type TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK(duration_ms BETWEEN 500 AND 6000),
    media BYTEA NOT NULL CHECK(octet_length(media) BETWEEN 16 AND 786432),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(stream_id,sequence)
    ); CREATE INDEX IF NOT EXISTS live_video_segments_expiry ON live_video_segments(created_at)`)
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function expirePlatformStreams(){
  await ensurePlatformLive()
  await query("DELETE FROM live_video_segments WHERE created_at<NOW()-INTERVAL '45 seconds'")
  await query(`UPDATE live_streams SET status='ended',media_status='ended',ended_at=NOW(),updated_at=NOW()
    WHERE stream_path LIKE 'app-%' AND status IN ('starting','live','reconnecting')
      AND COALESCE(last_media_event_at,created_at)<NOW()-INTERVAL '45 seconds'`)
  await query(`UPDATE live_streams SET status='reconnecting',media_status='disconnected',updated_at=NOW()
    WHERE stream_path LIKE 'app-%' AND status='live'
      AND last_media_event_at<NOW()-INTERVAL '15 seconds'`)
}

export async function createPlatformStream(userId,{streamId,title,category}){
  await ensurePlatformLive()
  await expirePlatformStreams()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    // Lock the account, so two tabs cannot each allocate a new broadcast.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])
    const {rows:active}=await client.query(`SELECT id FROM live_streams WHERE talent_id=$1
      AND status IN ('starting','live','reconnecting') LIMIT 1`,[userId])
    if(active.length)throw fail(409,'End your current Live before starting another.')
    const {rows}=await client.query(`INSERT INTO live_streams
      (id,talent_id,title,category,status,stream_path,media_status,last_media_event_at)
      VALUES($1,$2,$3,$4,'starting',$5,'authorizing',NOW()) RETURNING *`,
      [streamId,userId,title,category,`app-${streamId}`])
    await client.query('COMMIT')
    return rows[0]
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function uploadPlatformSegment(userId,body){
  const streamId=id(body.stream_id),seq=sequence(body.sequence)
  const mime=String(body.mime_type||'').toLowerCase(),duration=Number(body.duration_ms)
  if(!MIME.test(mime)||!Number.isInteger(duration)||duration<500||duration>6000)
    throw fail(400,'Unsupported Live video format or segment duration.')
  const encoded=body.media
  if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_LIVE_SEGMENT_BYTES/3)*4||
    encoded.length%4!==0||/[^A-Za-z0-9+/=]/.test(encoded))
    throw fail(413,'Live video segment is invalid or too large.')
  const media=Buffer.from(encoded,'base64')
  if(media.toString('base64')!==encoded)throw fail(400,'Invalid Live video encoding.')
  const webm=mime.startsWith('video/webm')
  if(media.length<16||media.length>MAX_LIVE_SEGMENT_BYTES||
    (webm?media.subarray(0,4).toString('hex')!=='1a45dfa3':media.subarray(4,8).toString()!=='ftyp'))
    throw fail(400,'A complete playable video segment is required.')
  await ensurePlatformLive()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT * FROM live_streams WHERE id=$1 FOR UPDATE',[streamId])
    const stream=rows[0]
    if(!stream||stream.talent_id!==userId)throw fail(403,'Only the broadcast owner can upload video.')
    if(!isPlatformStream(stream)||!['starting','live','reconnecting'].includes(stream.status))
      throw fail(409,'This broadcast is not accepting video.')
    const {rows:recent}=await client.query(`SELECT sequence,media,mime_type,duration_ms,
      EXTRACT(EPOCH FROM (NOW()-created_at))*1000 AS age_ms
      FROM live_video_segments WHERE stream_id=$1 ORDER BY sequence DESC LIMIT 1`,[streamId])
    const last=recent[0]
    if(last&&seq===last.sequence){
      if(!Buffer.from(last.media).equals(media)||last.mime_type!==mime||last.duration_ms!==duration)
        throw fail(409,'This segment sequence already contains different video.')
      await client.query('COMMIT');return {sequence:seq,status:stream.status,already_processed:true}
    }
    if(seq!==(last?last.sequence+1:1))throw fail(409,'Upload the next video segment in order.')
    if(last&&Number(last.age_ms)<750)throw fail(429,'Video segments are arriving too quickly.')
    await client.query(`INSERT INTO live_video_segments(stream_id,sequence,mime_type,duration_ms,media)
      VALUES($1,$2,$3,$4,$5)`,[streamId,seq,mime,duration,media])
    await client.query(`UPDATE live_streams SET status='live',media_status='connected',
      started_at=COALESCE(started_at,NOW()),last_media_event_at=NOW(),updated_at=NOW() WHERE id=$1`,[streamId])
    // Bounded rolling buffer, never a permanent recording or unbounded DB upload.
    await client.query(`DELETE FROM live_video_segments WHERE (stream_id=$1 AND sequence<$2)
      OR created_at<NOW()-INTERVAL '45 seconds'`,[streamId,Math.max(1,seq-7)])
    await client.query('COMMIT')
    return {sequence:seq,status:'live',already_processed:false}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function platformManifest(streamId){
  id(streamId);await ensurePlatformLive();await expirePlatformStreams()
  const {rows}=await query('SELECT stream_path,status FROM live_streams WHERE id=$1',[streamId])
  if(!rows[0]||!isPlatformStream(rows[0]))throw fail(404,'Live video not found.')
  if(!['live','reconnecting'].includes(rows[0].status))return {status:rows[0].status,segments:[]}
  const {rows:segments}=await query(`SELECT sequence,mime_type,duration_ms FROM live_video_segments
    WHERE stream_id=$1 AND created_at>NOW()-INTERVAL '45 seconds' ORDER BY sequence`,[streamId])
  return {status:rows[0].status,segments}
}

export async function platformSegment(streamId,seq){
  id(streamId);sequence(seq);await ensurePlatformLive()
  const {rows}=await query(`SELECT v.media,v.mime_type FROM live_video_segments v
    JOIN live_streams s ON s.id=v.stream_id WHERE v.stream_id=$1 AND v.sequence=$2
      AND s.stream_path LIKE 'app-%' AND s.status IN ('live','reconnecting')
      AND s.last_media_event_at>NOW()-INTERVAL '45 seconds'
      AND v.created_at>NOW()-INTERVAL '45 seconds'`,[streamId,Number(seq)])
  if(!rows.length)throw fail(404,'This Live segment has expired.')
  return {media:Buffer.from(rows[0].media),mime:rows[0].mime_type}
}

export async function clearPlatformSegments(streamId){
  await ensurePlatformLive()
  await query('DELETE FROM live_video_segments WHERE stream_id=$1 OR created_at<NOW()-INTERVAL \'45 seconds\'',[streamId])
}
