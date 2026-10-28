// Gold/Diamond-only Top 12, selected on the server from authoritative
// completed escrows and exactly the same activity-based Orbit policy as Work Pass.
// One representative Hat per owner prevents a single account taking all slots.
import { query } from './db.js'
import { orbitWeights, calculateOrbitScore } from './accountOrbit.js'
import { getHatPresentationMap } from './hatPresentation.js'
import { associateVouchCounts } from './associates.js'
import { SHOWROOM_SQL_CONTACT_PATTERN } from './showroomEligibility.js'
import { workPassTier } from '../../shared/workPass.js'

export const TOP12_SIZE = 12
export function selectGoldTop12(owners, weights, activityDays = new Map()) {
  return owners.map(owner => {
    const metrics = {
      completedProfileFields: [
        Boolean(owner.avatar_url), Boolean(owner.bio?.trim()),
        Boolean(owner.skills?.length), Boolean(owner.location || owner.lga),
        Boolean(owner.country),
      ].filter(Boolean).length,
      verifiedIdentity: Number(owner.verified_hats) > 0,
      completedWork: Number(owner.completed_jobs || 0),
      successfulHires: Number(owner.successful_hires || 0),
      activeDays: activityDays.get(owner.id)?.size || 0,
      accountAgeDays: Math.max(0, Math.floor((Date.now() - new Date(owner.created_at).getTime()) / 86400000)),
    }
    const orbit = calculateOrbitScore(metrics, weights).score
    const tier = workPassTier(metrics.completedWork, orbit)
    return { id: owner.id, username: owner.username, orbit, tier,
      completedJobs: metrics.completedWork }
  }).filter(owner => owner.tier === 'Gold' || owner.tier === 'Diamond')
    .sort((a,b) => b.orbit - a.orbit || b.completedJobs - a.completedJobs || a.id.localeCompare(b.id))
    .slice(0, TOP12_SIZE)
}

export async function getGoldTop12(viewerId = null) {
  const { rows: tables } = await query(`SELECT
    to_regclass('showroom_hidden_hats') AS hidden,
    to_regclass('vibes_posts') AS vibes,
    to_regclass('showroom_gallery_posts') AS gallery`)
  const eligible = `h.active = true AND h.role = 'talent'
    AND EXISTS (SELECT 1 FROM hat_media media WHERE media.hat_id=h.id)
    ${tables[0]?.hidden ? 'AND NOT EXISTS (SELECT 1 FROM showroom_hidden_hats hidden WHERE hidden.hat_id=h.id)' : ''}
    AND NOT EXISTS (SELECT 1 FROM hat_media scanned WHERE scanned.hat_id=h.id
      AND scanned.screening_status IN ('pending','processing','held','rejected'))
    AND NOT EXISTS (SELECT 1 FROM showroom_review_state state WHERE state.hat_id=h.id
      AND state.status IN ('flagged','restricted'))
    AND NOT (COALESCE(h.hat_title,'') || ' ' || COALESCE(h.hat_name,'') || ' ' ||
      COALESCE(h.motto,'') ~* $1)
    AND NOT EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
      AND COALESCE(m.caption,'') ~* $1)`
  const {rows:owners}=await query(`SELECT u.id,u.username,u.created_at,u.avatar_url,u.bio,
    u.skills,u.location,u.lga,u.country,
    (SELECT COUNT(*)::int FROM escrows e WHERE e.talent_id=u.id AND e.status='released') AS completed_jobs,
    (SELECT COUNT(*)::int FROM escrows e WHERE e.client_id=u.id AND e.status='released') AS successful_hires,
    (SELECT COUNT(*)::int FROM hats v WHERE v.user_id=u.id AND v.is_verified=TRUE) AS verified_hats
    FROM users u
    WHERE (SELECT COUNT(*) FROM escrows e WHERE e.talent_id=u.id AND e.status='released') >= 10
    AND EXISTS (SELECT 1 FROM hats h WHERE h.user_id=u.id AND ${eligible})`,
    [SHOWROOM_SQL_CONTACT_PATTERN])
  if(!owners.length)return {hats:[],galleryPosts:[],nextCursor:null,view:'top12',categories:[]}
  const ids=owners.map(o=>o.id)
  const activitySql=[`SELECT user_id,created_at::date AS day FROM hats
    WHERE user_id=ANY($1::uuid[]) AND active=TRUE AND feed_visible=TRUE`]
  if(tables[0]?.vibes)activitySql.push(`SELECT author_id AS user_id,created_at::date AS day FROM vibes_posts
    WHERE author_id=ANY($1::uuid[]) AND deleted_at IS NULL AND moderation_status='visible'`)
  if(tables[0]?.gallery)activitySql.push(`SELECT author_id AS user_id,created_at::date AS day FROM showroom_gallery_posts
    WHERE author_id=ANY($1::uuid[]) AND deleted_at IS NULL AND moderation_status='visible'`)
  const [{rows:days},weights]=await Promise.all([
    query('SELECT DISTINCT user_id,day FROM ('+activitySql.join(' UNION ')+') workdays',[ids]),
    orbitWeights(),
  ])
  const activity=new Map()
  for(const row of days){
    if(!activity.has(row.user_id))activity.set(row.user_id,new Set())
    activity.get(row.user_id).add(String(row.day))
  }
  const top=selectGoldTop12(owners,weights,activity)
  if(!top.length)return {hats:[],galleryPosts:[],nextCursor:null,view:'top12',categories:[]}
  const {rows:hats}=await query(`SELECT DISTINCT ON (h.user_id) h.*,
    u.avatar_url AS owner_avatar,u.full_name AS owner_full_name,
    u.role AS owner_role,u.company_suffix AS owner_company_suffix
    FROM hats h JOIN users u ON u.id=h.user_id
    WHERE h.user_id=ANY($2::uuid[]) AND ${eligible}
    ORDER BY h.user_id,h.bookings DESC NULLS LAST,h.likes DESC NULLS LAST,h.created_at DESC,h.id DESC`,
    [SHOWROOM_SQL_CONTACT_PATTERN,top.map(o=>o.id)])
  const hatByOwner=new Map(hats.map(h=>[h.user_id,h]))
  const selected=top.map(t=>({hat:hatByOwner.get(t.id),pass:t})).filter(x=>x.hat)
  const hatIds=selected.map(x=>x.hat.id)
  const [presentation,mediaResult,likesResult,vouches]=await Promise.all([
    getHatPresentationMap(hatIds),
    query(`SELECT id,hat_id,url,public_id,type,caption,screening_status FROM hat_media
      WHERE hat_id=ANY($1::uuid[]) ORDER BY created_at,id`,[hatIds]),
    viewerId ? query('SELECT hat_id FROM hat_likes WHERE user_id=$1 AND hat_id=ANY($2::uuid[])',[viewerId,hatIds]) : Promise.resolve({rows:[]}),
    associateVouchCounts(selected.map(x=>x.hat.user_id)),
  ])
  const mediaByHat=new Map()
  for(const m of mediaResult.rows){
    if(!mediaByHat.has(m.hat_id))mediaByHat.set(m.hat_id,[])
    mediaByHat.get(m.hat_id).push(m)
  }
  const liked=new Set(likesResult.rows.map(r=>r.hat_id))
  return {hats:selected.map(({hat,pass},i)=>({
      ...hat,work_pass_tier:pass.tier,work_pass_orbit:pass.orbit,top12_rank:i+1,
      media:mediaByHat.get(hat.id)||[],associate_vouch_count:vouches[hat.user_id]||0,
      bento_accent:presentation[hat.id]?.accent||'electric',
      showroom_template:presentation[hat.id]?.template||'minimal',
      liked_by_me:liked.has(hat.id),isHost:false,
    })),galleryPosts:[],nextCursor:null,view:'top12',categories:[]}
}
