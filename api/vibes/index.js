// Community posts deliberately do not share escrow messages or Hat media.
import { randomUUID } from 'node:crypto'
import { query, getClient } from '../_lib/db.js'
import {onlinePresenceExpression} from '../_lib/onlinePresence.js'
import {providerVerdict,unsafeVisionResult} from '../_lib/vibesModeration.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, readBody, methodNotAllowed } from '../_lib/http.js'
import { uploadCloudCredentials, cloudinaryUploadSignature } from '../_lib/hatMediaUpload.js'
import { notifyUser } from '../_lib/notifications.js'
import {dispatchStoredNotification} from '../_lib/pushNotifications.js'

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
  if(video && process.env.VIBES_CLOUDINARY_VIDEO_MODERATION==='google_video_moderation')
    params.moderation='google_video_moderation'
  if(!video && ['aws_rek','webpurify'].includes(process.env.VIBES_CLOUDINARY_IMAGE_MODERATION))
    params.moderation=process.env.VIBES_CLOUDINARY_IMAGE_MODERATION
  const signature = cloudinaryUploadSignature(params,cloud.apiSecret)
  await query(`INSERT INTO vibes_upload_permits (id,user_id,public_id,declared_bytes,declared_mime)
    VALUES ($1,$2,$3,$4,$5)`,[permitId,userId,publicId,body.bytes,mime])
  return {cloudName:cloud.cloudName, apiKey:cloud.apiKey,permitId,params,signature,resourceType:video?'video':'image'}
}

// Prefer configured provider decisions, otherwise scan video frames with Vision.
// Before Google Vision is configured, Cloudinary-verified uploads publish by
// default. Once screening is configured, flagged or unavailable results stay held.
async function videoModeration(asset,cloud){
  const verdict=providerVerdict(asset.moderation)
  if(verdict==='review')return {needs_review:true,risk:'provider_rejected'}
  if(verdict==='pending')return {needs_review:true,risk:'provider_pending'}
  if(verdict==='approved')return {needs_review:false,risk:null}
  const key=process.env.GOOGLE_CLOUD_VISION_API_KEY
  if(!key)return {needs_review:false,risk:null}
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
      signal:AbortSignal.timeout(8000),
    })
    if(!response.ok)return {needs_review:true,risk:'screening_unavailable'}
    const results=(await response.json()).responses
    if(!Array.isArray(results)||results.length!==sampleUrls.length)
      return {needs_review:true,risk:'screening_incomplete'}
    const risk=results.some(row=>row.error||unsafeVisionResult(row.safeSearchAnnotation))
    return {needs_review:risk,risk:risk?'unsafe_or_incomplete':null}
  }catch{return {needs_review:true,risk:'screening_unavailable'}}
}

async function verifyUploads(userId, media) {
  if (!Array.isArray(media) || media.length > MAX_MEDIA) throw bad(400,'Attach at most ten photos or videos per post.')
  if (!media.length) return []
  const cloud = mediaConfig()
  const seen = new Set()
  const verifyOne=async item=>{
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
    const photoVerdict=providerVerdict(asset.moderation)
    if(photoVerdict!=='unconfigured'){
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,type:'image',
        bytes:asset.bytes,needs_review:photoVerdict!=='approved'}
    }
    if(!process.env.GOOGLE_CLOUD_VISION_API_KEY)
      // Vision is not configured yet. The signed permit and authoritative
      // Cloudinary asset checks above still run; don't create a review queue
      // solely because the optional safety provider has not been connected.
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,type:'image',bytes:asset.bytes,needs_review:false}
    // Fail closed when screening is unreachable. Do not disclose images until a
    // safety decision has been obtained.
    let screened
    try {
      screened=await fetch('https://vision.googleapis.com/v1/images:annotate',{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GOOGLE_CLOUD_VISION_API_KEY},
        body:JSON.stringify({requests:[{image:{source:{imageUri:item.url}},features:[{type:'SAFE_SEARCH_DETECTION'}]}]}),
        signal:AbortSignal.timeout(9000),
      })
    } catch {
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,
        type:'image',bytes:asset.bytes,needs_review:true}
    }
    if(!screened.ok) return {upload_id:permit.id,public_id:permit.public_id,
      url:item.url,type:'image',bytes:asset.bytes,needs_review:true}
    const scan=(await screened.json()).responses?.[0]
    if(scan?.error || !scan?.safeSearchAnnotation)
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,
        type:'image',bytes:asset.bytes,needs_review:true}
    const safety=scan.safeSearchAnnotation
    if(unsafeVisionResult(safety))
      return {upload_id:permit.id,public_id:permit.public_id,url:item.url,
        type:'image',bytes:asset.bytes,needs_review:true}
    return {upload_id:permit.id,public_id:permit.public_id,url:item.url,type:'image',bytes:asset.bytes}
  }
  const result=new Array(media.length)
  let next=0
  await Promise.all(Array.from({length:Math.min(3,media.length)},async()=>{
    while(next<media.length){
      const index=next++
      result[index]=await verifyOne(media[index])
    }
  }))
  return result
}

// Checked on the owner's immediate post-upload status polls. Safe
// Cloudinary AI decisions can publish without an admin. Failed, unknown or
// suspicious decisions stay held for review.
async function refreshHeldPost(userId,postId){
  if(!validId(postId))throw bad(400,'Invalid Vibe post.')
  const {rows}=await query(`SELECT id,media,moderation_status FROM vibes_posts
    WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL`,[postId,userId])
  const post=rows[0]
  if(!post)throw bad(404,'Post not found.')
  if(post.moderation_status!=='held')return {status:post.moderation_status}
  const cloud=mediaConfig()
  for(const item of post.media||[]){
    const type=item.type==='video'?'video':'image'
    const endpoint=`https://api.cloudinary.com/v1_1/${cloud.cloudName}/resources/${type}/upload/${encodeURIComponent(item.public_id)}`
    let asset
    try{
      const response=await fetch(endpoint,{
        headers:{Authorization:'Basic '+Buffer.from(cloud.apiKey+':'+cloud.apiSecret).toString('base64')},
        signal:AbortSignal.timeout(5000),
      })
      if(!response.ok)return {status:'held'}
      asset=await response.json()
    }catch{return {status:'held'}}
    if(asset.public_id!==item.public_id||asset.secure_url!==item.url)
      return {status:'held'}
    if(type==='image' && providerVerdict(asset.moderation)!=='unconfigured'){
      if(providerVerdict(asset.moderation)!=='approved')return {status:'held'}
      continue
    }
    if(type==='video'){
      const decision=await videoModeration(asset,cloud)
      if(decision.needs_review)return {status:'held'}
    }else{
      const key=process.env.GOOGLE_CLOUD_VISION_API_KEY
      if(!key)return {status:'held'}
      try{
        const checked=await fetch('https://vision.googleapis.com/v1/images:annotate',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key':key},
          body:JSON.stringify({requests:[{image:{source:{imageUri:item.url}},
            features:[{type:'SAFE_SEARCH_DETECTION'}]}]}),
          signal:AbortSignal.timeout(5000),
        })
        if(!checked.ok)return {status:'held'}
        const annotation=(await checked.json()).responses?.[0]?.safeSearchAnnotation
        if(unsafeVisionResult(annotation))return {status:'held'}
      }catch{return {status:'held'}}
    }
  }
  await query(`UPDATE vibes_posts SET moderation_status='visible'
    WHERE id=$1 AND author_id=$2 AND moderation_status='held' AND deleted_at IS NULL`,
    [postId,userId])
  return {status:'visible'}
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
    return {id:post.id,pending_review:verified.some(item=>item.needs_review)}
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
  const search=String(url.searchParams.get('search')||'').trim().slice(0,100)
  if((before && !validId(before))||(specific && !validId(specific))) throw bad(400,'Invalid Vibes cursor.')
  const {rows}=await query(
    (await publicPostSql())+` AND ($2::uuid IS NULL OR p.id=$2)
    AND ($3::uuid IS NULL OR (p.created_at,p.id) <
       (SELECT created_at,id FROM vibes_posts WHERE id=$3))
    AND ($4::text IS NULL OR p.body ILIKE '%'||$4||'%' OR u.username ILIKE '%'||$4||'%' OR u.full_name ILIKE '%'||$4||'%')
    ORDER BY p.created_at DESC,p.id DESC LIMIT 21`,
    [userId,specific||null,before||null,search||null],
  )
  return {posts:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null}
}

async function threadsInstalled() {
  const {rows}=await query(`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='vibes_comments' AND column_name='parent_id'
  ) AS installed`)
  return rows[0]?.installed===true
}

async function getComments(userId,url) {
  const post=url.searchParams.get('comments')
  const before=url.searchParams.get('before')
  const parent=url.searchParams.get('parent_id')
  if(!validId(post)||(before&&!validId(before))||(parent&&!validId(parent)))
    throw bad(400,'Invalid comment cursor or parent.')
  const threaded=await threadsInstalled()
  if(parent&&!threaded)throw bad(503,'Apply the Vibes Threads migration in Admin to enable comment replies.')
  if(parent){
    const {rows:parents}=await query(`SELECT c.id FROM vibes_comments c JOIN vibes_posts p ON p.id=c.post_id
      WHERE c.id=$1 AND c.post_id=$2 AND c.parent_id IS NULL AND c.deleted_at IS NULL
        AND p.deleted_at IS NULL AND p.moderation_status='visible'`,[parent,post])
    if(!parents.length)throw bad(404,'Parent comment is unavailable.')
  }
  if(!threaded) {
    // Keep historical flat comments working until Admin applies the new SQL.
    const {rows}=await query(`SELECT c.id,c.post_id,c.author_id,c.body,c.created_at,
      (to_jsonb(c)->>'edited_at') AS edited_at,u.username,u.full_name,u.avatar_url,
      ${await onlinePresenceExpression('c.author_id')} AS is_online
      FROM vibes_comments c JOIN users u ON u.id=c.author_id
      JOIN vibes_posts p ON p.id=c.post_id
      WHERE c.post_id=$1 AND c.deleted_at IS NULL
        AND p.deleted_at IS NULL AND p.moderation_status='visible'
        AND ($2::uuid IS NULL OR (c.created_at,c.id) <
             (SELECT created_at,id FROM vibes_comments WHERE id=$2 AND post_id=$1))
      ORDER BY c.created_at DESC,c.id DESC LIMIT 31`,[post,before||null])
    return {comments:rows.slice(0,30),nextCursor:rows.length>30?rows[29].id:null,threaded:false}
  }
  const {rows}=await query(`SELECT c.id,c.post_id,c.parent_id,c.author_id,
      CASE WHEN c.deleted_at IS NULL THEN c.body ELSE '' END AS body,
      c.deleted_at IS NOT NULL AS deleted,c.created_at,
      (to_jsonb(c)->>'edited_at') AS edited_at,u.username,u.full_name,u.avatar_url,
      ${await onlinePresenceExpression('c.author_id')} AS is_online,
      (SELECT COUNT(*)::int FROM vibes_comments child
        WHERE child.parent_id=c.id AND child.deleted_at IS NULL) AS child_count
    FROM vibes_comments c JOIN users u ON u.id=c.author_id
    JOIN vibes_posts p ON p.id=c.post_id
    WHERE c.post_id=$1 AND c.parent_id IS NOT DISTINCT FROM $3::uuid
      AND p.deleted_at IS NULL AND p.moderation_status='visible'
      AND (c.deleted_at IS NULL OR ($3::uuid IS NULL AND EXISTS(
        SELECT 1 FROM vibes_comments child WHERE child.parent_id=c.id AND child.deleted_at IS NULL)))
      AND ($2::uuid IS NULL OR (c.created_at,c.id) <
           (SELECT created_at,id FROM vibes_comments
             WHERE id=$2 AND post_id=$1 AND parent_id IS NOT DISTINCT FROM $3::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 31`,[post,before||null,parent||null])
  return {comments:rows.slice(0,30),nextCursor:rows.length>30?rows[29].id:null,threaded:true}
}

async function getVibeLikers(url) {
  const post=url.searchParams.get('likers')
  const page=Number(url.searchParams.get('page')||0)
  if(!validId(post)||!Number.isSafeInteger(page)||page<0||page>100)
    throw bad(400,'Invalid Vibes likes request.')
  const {rows:posts}=await query(`SELECT id FROM vibes_posts
    WHERE id=$1 AND deleted_at IS NULL AND moderation_status='visible'`,[post])
  if(!posts.length)throw bad(404,'Vibe unavailable.')
  const {rows}=await query(`SELECT u.username,u.full_name AS name,u.avatar_url AS "avatarUrl",
      l.created_at AS "likedAt"
    FROM vibes_likes l JOIN users u ON u.id=l.user_id
    WHERE l.post_id=$1
    ORDER BY l.created_at DESC,l.user_id DESC
    LIMIT 26 OFFSET $2`,[post,page*25])
  return {people:rows.slice(0,25),nextPage:rows.length>25?page+1:null}
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
    let milestone=null
    if(liked && Number(count.likes)===10) {
      // First-ten is a milestone, never ten individual like alerts.
      // Atomic with the like and deduplicated against prior milestones.
      const {rows:made}=await client.query(`INSERT INTO notifications
        (user_id,type,title,body,link_url,metadata)
        SELECT p.author_id,'vibes_first_ten','Your Hit reached 10 likes',
          'Your new Hit reached its first 10 likes.','/vibes?post='||p.id,
          jsonb_build_object('post_id',p.id)
        FROM vibes_posts p WHERE p.id=$1 AND p.author_id<>$2
          AND p.created_at>NOW()-INTERVAL '7 days'
          AND NOT EXISTS(SELECT 1 FROM notifications n
            WHERE n.user_id=p.author_id AND n.type='vibes_first_ten'
              AND n.metadata->>'post_id'=p.id::text)
        ON CONFLICT DO NOTHING
        RETURNING id,user_id,type,title,body,link_url,metadata,read_at,created_at`,[postId,userId])
      milestone=made[0]||null
    }
    await client.query('COMMIT')
    if(milestone)await dispatchStoredNotification(milestone)
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
  const parentId=body.parent_id||null
  if(parentId&&!validId(parentId))throw bad(400,'Invalid parent comment.')
  const threaded=parentId?await threadsInstalled():false
  if(parentId&&!threaded)throw bad(503,'Apply the Vibes Threads migration in Admin first.')
  const {rows}=parentId?await query(
    `INSERT INTO vibes_comments(post_id,author_id,body,parent_id)
     SELECT p.id,$2,$3,c.id FROM vibes_posts p
     JOIN vibes_comments c ON c.id=$4 AND c.post_id=p.id AND c.parent_id IS NULL
       AND c.deleted_at IS NULL
     WHERE p.id=$1 AND p.deleted_at IS NULL AND p.moderation_status='visible'
     RETURNING id`,[postId,userId,text,parentId],
  ):await query(
    `INSERT INTO vibes_comments(post_id,author_id,body)
     SELECT p.id,$2,$3 FROM vibes_posts p WHERE p.id=$1 AND p.deleted_at IS NULL
       AND p.moderation_status='visible'
     RETURNING id`,[postId,userId,text],
  )
  if(!rows.length) throw bad(404,parentId?'Parent comment unavailable.':'Post unavailable.')
  const {rows:owner}=await query('SELECT author_id FROM vibes_posts WHERE id=$1',[postId])
  if(owner[0]?.author_id!==userId) {
    // Replies only make the daily digest when sent by a verified talent or
    // a mutual Associate. Ordinary comments remain readable in the post.
    const {rows:verification}=await query(`SELECT EXISTS(SELECT 1 FROM hats
      WHERE user_id=$1 AND active=TRUE AND is_verified=TRUE) AS qualified`,[userId])
    let meaningful=verification[0]?.qualified===true
    if(!meaningful){
      const {rows:installed}=await query("SELECT to_regclass('associate_links') AS links")
      if(installed[0]?.links){
        const {rows:related}=await query(`SELECT 1 FROM associate_links
          WHERE status='accepted'
            AND member_low=LEAST($1::uuid,$2::uuid)
            AND member_high=GREATEST($1::uuid,$2::uuid) LIMIT 1`,
          [owner[0].author_id,userId])
        meaningful=related.length>0
      }
    }
    if(meaningful)await notifyUser({userId:owner[0].author_id,type:'vibes_reply',
      title:'A professional connection replied to your Hit',
      body:'An Associate or verified talent commented on your post.',
      linkUrl:`/vibes?post=${postId}`,metadata:{post_id:postId}})
  }
  return {id:rows[0].id,parent_id:parentId}
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
      const statusId=url.searchParams.get('moderation_status')
      if(statusId)return json(res,200,await refreshHeldPost(session.sub,statusId))
      return json(res,200,url.searchParams.has('likers')
        ? await getVibeLikers(url)
        : url.searchParams.has('comments')
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
