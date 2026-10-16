// Standalone Showroom entertainment, deliberately isolated from Hats, offers and escrow.
// Uploads use the already audited signed Hat-media permit mechanism, but are
// claimed by this gallery instead of attaching to a commercial Hat.
import { query, getClient } from './db.js'
import { issueHatUploadPermit, signedHatMediaEnabled, verifyNewHatMedia } from './hatMediaUpload.js'
import { inspectMediaAsset } from './showroomMediaScreening.js'
import { showroomTextIssue } from './showroomEligibility.js'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const REASONS = new Set(['spam','unsafe','harassment','copyright','other'])
const err = (status, message) => Object.assign(new Error(message), {status})
const uuid = value => UUID.test(String(value || ''))
const requireId = value => { if (!uuid(value)) throw err(400, 'Invalid gallery post.'); return value }

async function installed() {
  const {rows} = await query("SELECT to_regclass('showroom_gallery_posts') AS name")
  return Boolean(rows[0]?.name)
}
async function requireStorage() {
  if (!await installed()) throw err(503, 'Apply the Independent Showroom gallery migration in Admin first.')
}

function toFeed(row) {
  return {
    id:row.id, user_id:row.author_id, username:row.username,
    owner_username:row.username, owner_full_name:row.full_name,
    owner_avatar:row.avatar_url, owner_role:row.role,
    owner_company_suffix:row.company_suffix, role:'talent',
    country:row.country, lga:row.lga, hat_title:null,
    category:'Entertainment', skills:[], is_entertainment:true,
    active:true, availability:false, bento_accent:'none',
    showroom_template:'media-first', created_at:row.created_at,
    moderation_status:row.moderation_status, views:Number(row.views || 0),
    likes:Number(row.likes || 0), liked_by_me:row.liked_by_me === true,
    media:[{type:row.media_type,url:row.media_url,public_id:row.public_id,
      caption:row.caption,screening_status:row.moderation_status}],
  }
}

const PROJECTION = `SELECT p.*,u.username,u.full_name,u.avatar_url,u.role,u.company_suffix,
 u.country,u.lga,
 (SELECT COUNT(*)::int FROM showroom_gallery_likes l WHERE l.post_id=p.id) AS likes,
 EXISTS(SELECT 1 FROM showroom_gallery_likes l WHERE l.post_id=p.id
   AND l.user_id=$1::uuid) AS liked_by_me
 FROM showroom_gallery_posts p JOIN users u ON u.id=p.author_id`

export async function galleryFeed(userId, url) {
  if (!await installed()) return {posts:[],nextCursor:null}
  const cursor = url.searchParams.get('before')
  if (cursor && !uuid(cursor)) throw err(400,'Invalid gallery cursor.')
  const search = String(url.searchParams.get('search') || '').trim().slice(0,100)
  const view = String(url.searchParams.get('view') || 'for_you')
  const category = String(url.searchParams.get('category') || '')
  // Gallery is entertainment, not a commerce category filter.
  if (category && category !== 'Entertainment') return {posts:[],nextCursor:null}
  let nearLga = null
  if (view === 'near' && userId) {
    const {rows} = await query('SELECT lga FROM users WHERE id=$1',[userId])
    nearLga = rows[0]?.lga || null
  }
  const {rows} = await query(`${PROJECTION}
   WHERE p.moderation_status='visible' AND p.deleted_at IS NULL
   AND ($2::uuid IS NULL OR (p.created_at,p.id) <
      (SELECT created_at,id FROM showroom_gallery_posts WHERE id=$2))
   AND ($3::text='' OR p.caption ILIKE '%' || $3 || '%'
        OR u.username ILIKE '%' || $3 || '%' OR u.full_name ILIKE '%' || $3 || '%')
   AND ($4::text <> 'near' OR ($5::text IS NOT NULL
        AND LOWER(COALESCE(NULLIF(u.lga,''),''))=LOWER($5)))
   ORDER BY p.created_at DESC,p.id DESC LIMIT 16`,
    [userId||null,cursor||null,search,view,nearLga])
  return {posts:rows.slice(0,15).map(toFeed),
    nextCursor:rows.length>15?rows[14].id:null}
}

export async function galleryPost(userId, id) {
  requireId(id)
  await requireStorage()
  const {rows} = await query(`${PROJECTION}
    WHERE p.id=$2 AND p.deleted_at IS NULL
      AND (p.moderation_status='visible' OR p.author_id=$1::uuid)`,
  [userId||null,id])
  if (!rows.length) throw err(404,'Gallery post unavailable.')
  return {post:toFeed(rows[0])}
}

export async function galleryMine(userId) {
  await requireStorage()
  const {rows} = await query(`SELECT id,media_url,media_type,caption,
    moderation_status,moderation_reason,created_at FROM showroom_gallery_posts
    WHERE author_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 60`,[userId])
  return {posts:rows}
}

export async function signGalleryUpload(userId, body) {
  await requireStorage()
  if (!signedHatMediaEnabled())
    throw err(503,'Enable HAT_MEDIA_SIGNED_UPLOADS=enforce before direct gallery uploads.')
  return issueHatUploadPermit(userId,body)
}

async function approveSource(userId, media) {
  if (!media || typeof media!=='object' || !['image','video'].includes(media.type) ||
      typeof media.url!=='string' || media.url.length>2048 ||
      typeof media.public_id!=='string' || media.public_id.length>200)
    throw err(422,'Select a verified photo or video.')
  if (media.upload_id) {
    const verified=await verifyNewHatMedia(userId,[media],[])
    if (verified.length!==1) throw err(422,'Upload authorization is missing.')
    return {permit:verified[0],alreadyScreened:false}
  }
  const {rows:existing}=await query(`SELECT m.screening_status FROM hat_media m
    JOIN hats h ON h.id=m.hat_id WHERE h.user_id=$1 AND m.public_id=$2
    AND m.url=$3 AND m.type=$4 AND m.screening_status IN ('legacy','passed') LIMIT 1`,
   [userId,media.public_id,media.url,media.type])
  if (existing.length) return {permit:null,alreadyScreened:existing[0].screening_status==='passed'}
  if (media.type==='image') {
    const {rows:table}=await query("SELECT to_regclass('vibes_posts') AS name")
    if (table[0]?.name) {
      const {rows:vibes}=await query(`SELECT 1 FROM vibes_posts p
        CROSS JOIN LATERAL jsonb_array_elements(p.media) AS asset(value)
        WHERE p.author_id=$1 AND p.deleted_at IS NULL AND p.moderation_status='visible'
        AND asset.value->>'public_id'=$2 AND asset.value->>'url'=$3
        AND asset.value->>'type'='image' LIMIT 1`,
        [userId,media.public_id,media.url])
      if (vibes.length) return {permit:null,alreadyScreened:true}
    }
  }
  throw err(422,'This file must come from your approved media library or a new signed upload.')
}

export async function publishGallery(userId, body) {
  await requireStorage()
  const caption=typeof body.caption==='string' ? body.caption.trim() : ''
  if (caption.length>500) throw err(400,'Maximum 500 caption characters.')
  const issue=showroomTextIssue({motto:caption})
  if(issue) throw err(422,issue)
  const media=body.media
  const source=await approveSource(userId,media)
  const {rows:recent}=await query(`SELECT COUNT(*)::int AS n FROM showroom_gallery_posts
    WHERE author_id=$1 AND created_at>NOW()-INTERVAL '1 hour'`,[userId])
  if(recent[0].n>=10) throw err(429,'You have reached the hourly Showroom posting limit.')
  // New images are inspected before publication. A failed external scan cannot
  // make an unreviewed asset public. Videos need complete human playback.
  let moderation='pending', reason=media.type==='video'?'video_requires_full_review':'screening_pending'
  if (source.alreadyScreened && media.type==='image') {
    moderation='visible';reason=null
  } else if (media.type==='image') {
    try {
      const finding=await inspectMediaAsset(media)
      moderation=finding.status==='passed'?'visible':'held'
      reason=finding.reason
    } catch {
      moderation='pending';reason='screening_unavailable'
    }
  }
  const client=await getClient()
  try {
    await client.query('BEGIN')
    if(source.permit) {
      const {rowCount}=await client.query(`UPDATE hat_media_upload_permits
        SET claimed_at=NOW(),claimed_hat_id=NULL
        WHERE id=$1 AND user_id=$2 AND public_id=$3
          AND claimed_at IS NULL AND expires_at>NOW()`,
        [source.permit.permitId,userId,media.public_id])
      if(rowCount!==1) throw err(409,'This upload was already used. Upload a new file.')
    }
    const {rows}=await client.query(`INSERT INTO showroom_gallery_posts
      (author_id,public_id,media_url,media_type,caption,moderation_status,moderation_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(author_id,public_id) DO NOTHING RETURNING id`,
      [userId,media.public_id,media.url,media.type,caption,moderation,reason])
    if(!rows.length) throw err(409,'You already posted this file to Showroom.')
    await client.query('COMMIT')
    return {id:rows[0].id,moderation_status:moderation,reason,
      message: moderation==='visible'?'Published to Showroom.':
        'Your upload is saved privately and will appear after moderation.'}
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  } finally {client.release()}
}

export async function galleryAction(userId, body) {
  await requireStorage()
  const id=requireId(body.post_id)
  const action=body.action
  if(action==='delete_gallery') {
    const {rowCount}=await query(`UPDATE showroom_gallery_posts
      SET deleted_at=NOW() WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL`,[id,userId])
    if(!rowCount) throw err(404,'Your gallery post was not found.')
    return {deleted:true}
  }
  if(action==='report_gallery') {
    if(!REASONS.has(body.reason)) throw err(400,'Choose a valid report reason.')
    const {rowCount}=await query(`INSERT INTO showroom_gallery_reports(post_id,reporter_id,reason)
      SELECT id,$2,$3 FROM showroom_gallery_posts
      WHERE id=$1 AND deleted_at IS NULL AND moderation_status='visible' AND author_id<>$2
      ON CONFLICT DO NOTHING`,[id,userId,body.reason])
    return {reported:rowCount>0}
  }
  if(action==='view_gallery') {
    // At most one recorded view per subscriber per calendar day.
    const {rows}=await query(`INSERT INTO showroom_gallery_viewers(post_id,viewer_id)
      SELECT id,$2 FROM showroom_gallery_posts
      WHERE id=$1 AND deleted_at IS NULL AND moderation_status='visible'
      ON CONFLICT(post_id,viewer_id) DO UPDATE
      SET last_viewed_at=NOW()
      WHERE showroom_gallery_viewers.last_viewed_at<NOW()-INTERVAL '1 day'
      RETURNING post_id`,[id,userId])
    if(rows.length) await query('UPDATE showroom_gallery_posts SET views=views+1 WHERE id=$1',[id])
    return {viewed:rows.length>0}
  }
  if(action==='like_gallery') {
    const client=await getClient()
    try {
      await client.query('BEGIN')
      const {rows:posts}=await client.query(`SELECT id FROM showroom_gallery_posts
        WHERE id=$1 AND moderation_status='visible' AND deleted_at IS NULL FOR SHARE`,[id])
      if(!posts.length) throw err(404,'Gallery post unavailable.')
      const result=await client.query('DELETE FROM showroom_gallery_likes WHERE post_id=$1 AND user_id=$2 RETURNING post_id',[id,userId])
      let liked=false
      if(!result.rowCount) {
        const added=await client.query(`INSERT INTO showroom_gallery_likes(post_id,user_id)
          VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING post_id`,[id,userId])
        liked=added.rowCount>0
      }
      const {rows}=await client.query('SELECT COUNT(*)::int AS n FROM showroom_gallery_likes WHERE post_id=$1',[id])
      await client.query('COMMIT')
      return {liked,likes:rows[0].n}
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{})
      throw error
    } finally {client.release()}
  }
  throw err(400,'Unknown gallery action.')
}

export async function adminGalleryQueue() {
  await requireStorage()
  const {rows}=await query(`SELECT p.id,p.media_url,p.media_type,p.caption,p.moderation_status,
    p.moderation_reason,p.created_at,u.username,
    (SELECT COUNT(*)::int FROM showroom_gallery_reports r WHERE r.post_id=p.id) AS reports
    FROM showroom_gallery_posts p JOIN users u ON u.id=p.author_id
    WHERE p.deleted_at IS NULL
      AND (p.moderation_status IN ('pending','held') OR EXISTS
        (SELECT 1 FROM showroom_gallery_reports r WHERE r.post_id=p.id))
    ORDER BY CASE WHEN p.moderation_status='visible' THEN 1 ELSE 0 END,p.created_at ASC LIMIT 100`)
  return {items:rows}
}

export async function adminGalleryDecision(adminId, body) {
  await requireStorage()
  const id=requireId(body.post_id)
  if(!['approve','reject'].includes(body.decision)) throw err(400,'Invalid gallery decision.')
  const client=await getClient()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query(`UPDATE showroom_gallery_posts
      SET moderation_status=$2,moderation_reason=$3,reviewed_by=$4,reviewed_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL RETURNING id`,[id,
      body.decision==='approve'?'visible':'rejected',
      body.decision==='approve'?'admin_approved':'admin_rejected',adminId])
    if(!rows.length) throw err(404,'Gallery post unavailable.')
    await client.query('DELETE FROM showroom_gallery_reports WHERE post_id=$1',[id])
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata)
      VALUES($1,'review_showroom_gallery','showroom_gallery',$2,$3::jsonb)`,
      [adminId,id,JSON.stringify({decision:body.decision})])
    await client.query('COMMIT')
    return {id,moderation_status:body.decision==='approve'?'visible':'rejected'}
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  } finally {client.release()}
}
