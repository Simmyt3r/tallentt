// Community posts deliberately do not share escrow messages or Hat media.
import { randomUUID } from 'node:crypto'
import { query, getClient } from '../_lib/db.js'
import {onlinePresenceExpression} from '../_lib/onlinePresence.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, readBody, methodNotAllowed } from '../_lib/http.js'
import { uploadCloudCredentials, cloudinaryUploadSignature } from '../_lib/hatMediaUpload.js'
import { notifyUser } from '../_lib/notifications.js'

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
const IMAGE_MIMES = new Set(['image/jpeg','image/png','image/webp'])
const VIDEO_MIMES = new Set(['video/mp4','video/webm','video/quicktime'])
const REASONS = new Set(['spam','harassment','unsafe','other'])
const MAX_MEDIA = 10
const MAX_POST_BYTES = 80 * 1024 * 1024
const bad = (status, message) => Object.assign(new Error(message), { status })
const validId = (value) => UUID.test(String(value || ''))
const maxBody = (value, max) => typeof value === 'string' ? value.trim().slice(0, max + 1) : ''
const mediaEnabled = () => !['disabled','false','0'].includes(String(process.env.VIBES_MEDIA_UPLOADS||'').toLowerCase())

// Media uploads are only enabled deliberately, with cloud identity and an
// image safety service configured. Never fall back to unsigned/foreign URLs.
function mediaConfig() {
  if (!mediaEnabled()) throw bad(503,'Photo posting is not configured yet. Text posts remain available.')
  const cloud = uploadCloudCredentials()
  return cloud
}

async function signUpload(userId, body) {
  const mime = String(body.mime || '').toLowerCase()
  const video=VIDEO_MIMES.has(mime)
  const maxBytes=video?20971520:8388608
  if(!(video||IMAGE_MIMES.has(mime))||!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>maxBytes)
    throw bad(400,'Choose an image up to 8MB or MP4, WebM or MOV video up to 20MB.')
  const cloud = mediaConfig()
  const {rows} = await query(
    "SELECT COUNT(*)::int AS n FROM vibes_upload_permits WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",
    [userId],
  )
  if (rows[0].n >= 50) throw bad(429,'Media upload limit reached. Try again later.')
  const permitId = randomUUID()
  const publicId = `chombutar_vibes/${userId}/${permitId}`
  const params = { public_id: publicId, timestamp: Math.floor(Date.now()/1000), overwrite:'false' }
  const signature = cloudinaryUploadSignature(params,cloud.apiSecret)
  await query(`INSERT INTO vibes_upload_permits (id,user_id,public_id,declared_bytes,declared_mime)
    VALUES ($1,$2,$3,$4,$5)`,[permitId,userId,publicId,body.bytes,mime])
  return {cloudName:cloud.cloudName, apiKey:cloud.apiKey,permitId,params,signature,resourceType:video?'video':'image'}
}

// Fast automatic video moderation uses approved provider decisions when
// available, otherwise scans a small spread of video frames with Vision.
// Unknown, unavailable and flagged results require review; never label
// an unscanned video as AI-approved.
async function videoModeration(asset,cloud){
  const decisions=Array.isArray(asset.moderation)?asset.moderation:[]
  if(decisions.some(d=>d.status==='rejected'))return {needs_review:true,risk:'provider_rejected'}
  if(decisions.some(d=>d.status==='approved'))return {needs_review:false,risk:null}
  if(decisions.some(d=>['pending','queued'].includes(d.status)))return {needs_review:true,risk:'provider_pending'}
  const key=process.env.GOOGLE_CLOUD_VISION_API_KEY
  if(!key)return {needs_review:true,risk:'screening_unconfigured'}
  const duration=Number(asset.duration)
  if(!Number.isFinite(duration)||duration<=0)return {needs_review:true,risk:'duration_unknown'}
  const samples=[0.1,0.25,0.5,0.75,0.95]
    .map(frac=>Math.max(0,Math.min(duration-0.05,frac*duration)))
  const sampleUrls=[...new Set(samples.map(t=>t.toFixed(2)))].map(time=>
    `https://res.cloudinary.com/${cloud.cloudName}/video/upload/so_${time},f_jpg/${asset.public_id}.jpg`)
  try{
    const response=await fetch('https://vision.googleapis.com/v1/images:annotate',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({requests:sampleUrls.map(uri=>({
        image:{source:{imageUri:uri}},features:[{type:'SAFE_SEARCH_DETECTION'}],
      }))}),
      signal:AbortSignal.timeout(20000),
    })
    if(!response.ok)return {needs_review:true,risk:'screening_unavailable'}
    const results=(await response.json()).responses
    if(!Array.isArray(results)||results.length!==sampleUrls.length)
      return {needs_review:true,risk:'screening_incomplete'}
    const risk=results.some(row=>row.error||!row.safeSearchAnnotation||
      ['LIKELY','VERY_LIKELY'].includes(row.safeSearchAnnotation.adult)||
      ['LIKELY','VERY_LIKELY'].includes(row.safeSearchAnnotation.violence)||
      ['LIKELY','VERY_LIKELY'].includes(row.safeSearchAnnotation.racy))
    return {needs_review:risk,risk:risk?'unsafe_or_incomplete':null}
  }catch{return {needs_review:true,risk:'screening_unavailable'}}
}

async function verifyUploads(userId, media) {
  if (!Array.isArray(media) || media.length > MAX_MEDIA) throw bad(400,'Attach at most ten photos or videos per post.')
  if (!media.length) return []
  const cloud = mediaConfig()
  const seen = new Set()
  return Promise.all(media.map(async (item) => {
    if (!item || !validId(item.upload_id) || typeof item.public_id !== 'string' ||
        item.public_id.length > 200 || typeof item.url !== 'string' ||
        seen.has(item.public_id)) throw bad(422,'Upload each photo through Vibes once.')
    seen.add(item.public_id)
    const {rows} = await query(`SELECT id,public_id,declared_bytes,declared_mime FROM vibes_upload_permits
      WHERE id=$1 AND user_id=$2 AND public_id=$3 AND claimed_at IS NULL AND expires_at>NOW()`,
    [item.upload_id,userId,item.public_id])
    const permit=rows[0]
    if(!permit) throw bad(422,'Photo authorization expired. Reupload this photo.')
    // Verify actual bytes, resource identity and signed URL from Cloudinary.
    const resourceType=VIDEO_MIMES.has(permit.declared_mime)?'video':'image'
    const maxBytes=resourceType==='video'?20971520:8388608
    const resource = `https://api.cloudinary.com/v1_1/${cloud.cloudName}/resources/${resourceType}/upload/${encodeURIComponent(item.public_id)}`
    let response
    try {
      response=await fetch(resource,{headers:{Authorization:'Basic '+Buffer.from(cloud.apiKey+':'+cloud.apiSecret).toString('base64')},
        signal:AbortSignal.timeout(9000)})
    } catch {throw bad(503,'Could not verify the photo with Cloudinary. Retry.') }
    if(!response.ok) throw bad(422,'Cloudinary has not confirmed this photo.')
    const asset=await response.json()
    if(asset.public_id!==permit.public_id || asset.resource_type!==resourceType || asset.type!=='upload' ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes<=0 || asset.bytes>maxBytes ||
      asset.bytes>Math.max(permit.declared_bytes+4096,permit.declared_bytes*1.15) ||
      asset.secure_url!==item.url || !item.url.startsWith(`https://res.cloudinary.com/${cloud.cloudName}/${resourceType}/upload/`) ||
      !Number.isSafeInteger(asset.version) || asset.version<1)
      throw bad(422,'Photo does not match its upload authorization.')
    if(resourceType==='video'){
      const decision=await videoModeration(asset,cloud)
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,
        type:'video',bytes:asset.bytes,needs_review:decision.needs_review}
    }
    if(!process.env.GOOGLE_CLOUD_VISION_API_KEY)
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,type:'image',bytes:asset.bytes,needs_review:true}
    // Fail closed when screening is unreachable. Do not disclose images until a
    // safety decision has been obtained.
    let screened
    try {
      screened=await fetch('https://vision.googleapis.com/v1/images:annotate',{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GOOGLE_CLOUD_VISION_API_KEY},
        body:JSON.stringify({requests:[{image:{source:{imageUri:item.url}},features:[{type:'SAFE_SEARCH_DETECTION'}]}]}),
        signal:AbortSignal.timeout(9000),
      })
    } catch {throw bad(503,'Photo safety check is unavailable. Retry shortly.')}
    if(!screened.ok) throw bad(503,'Photo safety check is unavailable. Retry shortly.')
    const scan=(await screened.json()).responses?.[0]
    if(scan?.error || !scan?.safeSearchAnnotation) throw bad(503,'Photo safety check is incomplete.')
    const safety=scan.safeSearchAnnotation
    if(['LIKELY','VERY_LIKELY'].includes(safety.adult) ||
       ['LIKELY','VERY_LIKELY'].includes(safety.violence) ||
       safety.racy==='VERY_LIKELY')
      throw bad(422,'This photo requires additional safety review. Choose another photo.')
    return {upload_id:permit.id,public_id:permit.public_id,url:item.url,type:'image',bytes:asset.bytes}
  }))
}

async function publish(userId, body) {
  const text=maxBody(body.text,10000)
  if(text.length>10000) throw bad(400,'Posts can contain up to 10,000 characters.')
  const verified=await verifyUploads(userId,body.media || [])
  if(verified.reduce((sum,item)=>sum+item.bytes,0)>MAX_POST_BYTES)
    throw bad(413,'Attachments exceed 80MB in total. Remove or compress some files.')
  if(!text && !verified.length) throw bad(400,'Write something or add media.')
  const client=await getClient()
  try {
    await client.query('BEGIN')
    const {rows:recent}=await client.query(
      "SELECT COUNT(*)::int AS n FROM vibes_posts WHERE author_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",
      [userId],
    )
    if(recent[0].n>=10) throw bad(429,'You have posted frequently. Try again in an hour.')
    const {rows:[post]}=await client.query(
      `INSERT INTO vibes_posts (author_id,body,media,moderation_status)
       VALUES($1,$2,$3::jsonb,$4) RETURNING id`,
      [userId,text,JSON.stringify(verified.map(({url,public_id,type})=>({url,public_id,type}))),
        verified.some(item=>item.needs_review)?'held':'visible'],
    )
    for(const photo of verified) {
      const {rowCount}=await client.query(`UPDATE vibes_upload_permits SET claimed_at=NOW(),claimed_post_id=$1
        WHERE id=$2 AND user_id=$3 AND public_id=$4 AND claimed_at IS NULL AND expires_at>NOW()`,
      [post.id,photo.upload_id,userId,photo.public_id])
      if(rowCount!==1) throw bad(409,'A photo was already used. Upload it again.')
    }
    await client.query('COMMIT')
    return {id:post.id,pending_review:verified.some(item=>item.type==='video'||item.needs_review)}
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  } finally { client.release() }
}

const publicPostSql = async()=>`SELECT p.id,p.body,p.media,p.created_at,(to_jsonb(p)->>'edited_at') AS edited_at,p.author_id,
  u.username,u.full_name,u.avatar_url,u.role,
  ${await onlinePresenceExpression('p.author_id')} AS is_online,
  (SELECT COUNT(*)::int FROM vibes_likes l WHERE l.post_id=p.id) AS likes,
  (SELECT COUNT(*)::int FROM vibes_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS replies,
  EXISTS(SELECT 1 FROM vibes_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked_by_me
  FROM vibes_posts p JOIN users u ON u.id=p.author_id
  WHERE p.deleted_at IS NULL AND p.moderation_status='visible'`

async function feed(userId,url) {
  const before=url.searchParams.get('before')
  const specific=url.searchParams.get('post')
  if((before && !validId(before))||(specific && !validId(specific))) throw bad(400,'Invalid Vibes cursor.')
  const {rows}=await query(
    (await publicPostSql())+` AND ($2::uuid IS NULL OR p.id=$2)
    AND ($3::uuid IS NULL OR (p.created_at,p.id) <
       (SELECT created_at,id FROM vibes_posts WHERE id=$3))
    ORDER BY p.created_at DESC,p.id DESC LIMIT 21`,
    [userId,specific||null,before||null],
  )
  return {posts:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null}
}

async function getComments(userId,url) {
  const post=url.searchParams.get('comments')
  const before=url.searchParams.get('before')
  if(!validId(post)||(before&&!validId(before))) throw bad(400,'Invalid comment cursor.')
  const {rows}=await query(
    `SELECT c.id,c.post_id,c.author_id,c.body,c.created_at,(to_jsonb(c)->>'edited_at') AS edited_at,u.username,u.full_name,u.avatar_url,
      ${await onlinePresenceExpression('c.author_id')} AS is_online
     FROM vibes_comments c JOIN users u ON u.id=c.author_id
     JOIN vibes_posts p ON p.id=c.post_id
     WHERE c.post_id=$1 AND c.deleted_at IS NULL
       AND p.deleted_at IS NULL AND p.moderation_status='visible'
       AND ($2::uuid IS NULL OR (c.created_at,c.id) <
           (SELECT created_at,id FROM vibes_comments WHERE id=$2 AND post_id=$1))
     ORDER BY c.created_at DESC,c.id DESC LIMIT 31`,
    [post,before||null],
  )
  return {comments:rows.slice(0,30),nextCursor:rows.length>30?rows[29].id:null}
}

async function toggleLike(userId,postId) {
  if(!validId(postId)) throw bad(400,'Invalid post.')
  const client=await getClient()
  try {
    await client.query('BEGIN')
    const {rows:posts}=await client.query(
      "SELECT id FROM vibes_posts WHERE id=$1 AND deleted_at IS NULL AND moderation_status='visible' FOR SHARE",[postId])
    if(!posts.length) throw bad(404,'Post unavailable.')
    const removed=await client.query('DELETE FROM vibes_likes WHERE post_id=$1 AND user_id=$2 RETURNING user_id',[postId,userId])
    let liked=false
    if(!removed.rowCount) {
      const inserted=await client.query(
        'INSERT INTO vibes_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
        [postId,userId])
      liked=inserted.rowCount>0
    }
    const {rows:[count]}=await client.query('SELECT COUNT(*)::int AS likes FROM vibes_likes WHERE post_id=$1',[postId])
    await client.query('COMMIT')
    return {liked,likes:count.likes}
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

async function comment(userId,postId,body) {
  if(!validId(postId)) throw bad(400,'Invalid post.')
  const text=maxBody(body.text,10000)
  if(!text||text.length>10000) throw bad(400,'Reply must contain 1–10,000 characters.')
  const {rows:limit}=await query(
    "SELECT COUNT(*)::int AS n FROM vibes_comments WHERE author_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",
    [userId],
  )
  if(limit[0].n>=40) throw bad(429,'Reply limit reached. Try again later.')
  const {rows}=await query(
    `INSERT INTO vibes_comments(post_id,author_id,body)
     SELECT p.id,$2,$3 FROM vibes_posts p WHERE p.id=$1 AND p.deleted_at IS NULL
       AND p.moderation_status='visible'
     RETURNING id`,[postId,userId,text],
  )
  if(!rows.length) throw bad(404,'Post unavailable.')
  const {rows:owner}=await query('SELECT author_id FROM vibes_posts WHERE id=$1',[postId])
  if(owner[0]?.author_id!==userId) {
    await notifyUser({userId:owner[0].author_id,type:'vibes_reply',title:'Someone replied to your Vibe',
      body:'Open your post to see the new reply.',linkUrl:`/vibes?post=${postId}`,metadata:{post_id:postId}})
  }
  return {id:rows[0].id}
}

async function modify(userId,body) {
  const postId=body.post_id
  if(!validId(postId)) throw bad(400,'Invalid post.')
  if(body.action==='like') return toggleLike(userId,postId)
  if(body.action==='reply') return comment(userId,postId,body)
  if(body.action==='edit_post'){
    if(typeof body.text!=='string'||body.text.trim().length>10000)
      throw bad(400,'Post text must contain no more than 10,000 characters.')
    const {rowCount}=await query(`UPDATE vibes_posts SET body=$3,edited_at=NOW(),
        moderation_status=CASE WHEN EXISTS(
          SELECT 1 FROM jsonb_array_elements(media) item WHERE item->>'type'='video'
        ) THEN 'held' ELSE moderation_status END
      WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL
        AND (char_length(btrim($3))>0 OR jsonb_array_length(media)>0)`,
      [postId,userId,body.text.trim()])
    if(!rowCount)throw bad(404,'Post is missing or empty.')
    return {edited:true}
  }
  if(body.action==='edit_reply'){
    if(!validId(body.comment_id)||typeof body.text!=='string'||
      !body.text.trim()||body.text.trim().length>10000)
      throw bad(400,'Reply must contain 1–10,000 characters.')
    const {rowCount}=await query(`UPDATE vibes_comments SET body=$4,edited_at=NOW()
      WHERE id=$1 AND post_id=$2 AND author_id=$3 AND deleted_at IS NULL`,
      [body.comment_id,postId,userId,body.text.trim()])
    if(!rowCount)throw bad(404,'Your reply was not found.')
    return {edited:true}
  }
  if(body.action==='delete') {
    const {rowCount}=await query(
      'UPDATE vibes_posts SET deleted_at=NOW() WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL',
      [postId,userId])
    if(!rowCount) throw bad(404,'Your post was not found.')
    return {deleted:true}
  }
  if(body.action==='delete_reply') {
    if(!validId(body.comment_id)) throw bad(400,'Invalid reply.')
    const {rowCount}=await query(
      'UPDATE vibes_comments SET deleted_at=NOW() WHERE id=$1 AND post_id=$2 AND author_id=$3 AND deleted_at IS NULL',
      [body.comment_id,postId,userId])
    if(!rowCount) throw bad(404,'Your reply was not found.')
    return {deleted:true}
  }
  if(body.action==='report') {
    if(!REASONS.has(body.reason)) throw bad(400,'Select a report reason.')
    const {rowCount}=await query(
      `INSERT INTO vibes_reports(post_id,reporter_id,reason)
       SELECT id,$2,$3 FROM vibes_posts
       WHERE id=$1 AND deleted_at IS NULL AND moderation_status='visible' AND author_id<>$2
       ON CONFLICT(post_id,reporter_id) DO NOTHING`,[postId,userId,body.reason])
    return {reported:rowCount>0}
  }
  throw bad(400,'Unknown Vibes action.')
}

export default async function handler(req,res) {
  const session=getSessionUser(req)
  if(!session?.sub) return json(res,401,{error:'Sign in to use Vibes.'})
  res.setHeader('Cache-Control','private, no-store')
  try {
    if(req.method==='GET') {
      const url=new URL(req.url,`http://${req.headers.host}`)
      return json(res,200,url.searchParams.has('comments')
        ? await getComments(session.sub,url)
        : await feed(session.sub,url))
    }
    if(req.method==='POST') {
      const body=await readBody(req)
      if(!body || typeof body!=='object' || Array.isArray(body)) throw bad(400,'Invalid Vibe request.')
      if(body.action==='upload_sign') return json(res,200,await signUpload(session.sub,body))
      if(body.action==='publish') return json(res,201,await publish(session.sub,body))
      return json(res,200,await modify(session.sub,body))
    }
    return methodNotAllowed(res,['GET','POST'])
  } catch(error) {
    if(!error.status) console.error('Vibes request failed:',error)
    return json(res,error.status||500,{error:error.status?error.message:'Could not complete the Vibes request.'})
  }
}
