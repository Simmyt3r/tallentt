// Release C. Serving is explicitly OFF by default. An advertisement
// cannot be delivered merely by changing a campaign status in SQL.
import {randomInt} from 'node:crypto'
import {query} from './db.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail=(status,message)=>Object.assign(new Error(message),{status})
const VERSION='ad-auto-2026-11-v1'
const validId=id=>{if(typeof id!=='string'||!UUID.test(id))throw fail(400,'Invalid placement identifier.');return id}
const readAvailable=async()=> {
  const {rows}=await query("SELECT to_regclass('ad_hat_placements') AS placements,to_regclass('ad_talent_ad_policy') AS policies,to_regclass('ad_campaign_terms') AS terms")
  return Boolean(rows[0]?.placements && rows[0]?.policies && rows[0]?.terms)
}
// Release F: even an inadvertently enabled legacy delivery flag cannot
// expose unmetered/unreconciled adverts to real production visitors.
export const deliveryEnabled=()=>process.env.CHOMBUTAR_AD_DELIVERY_ENABLED==='true'
  && process.env.VERCEL_ENV==='preview'

export async function publicSponsoredSlots(rawIds){
  // Never record views, clicks, ad delivery or Orbit on this read.
  if(!deliveryEnabled())return {placements:{},enabled:false}
  const ids=String(rawIds||'').split(',').filter(Boolean)
  if(!ids.length||ids.length>30||ids.some(x=>!UUID.test(x))||new Set(ids).size!==ids.length)
    throw fail(400,'Provide 1–30 unique Hat identifiers.')
  if(!await readAvailable())return {placements:{},enabled:false}
  // Require every funding receipt to be provider-verified, an accepted
  // immutable price contract, and a 30-day bounded placement. No onlooker,
  // founder or viewer identity is returned. One visible banner per Hat.
  const {rows}=await query(`SELECT p.id AS placement_id,p.hat_id,p.ends_at,
      c.id AS campaign_id,a.legal_name AS sponsor_name,
      cr.media_url AS image_url,cr.caption
    FROM ad_hat_placements p
    JOIN hats h ON h.id=p.hat_id
    JOIN ad_campaigns c ON c.id=p.campaign_id
    JOIN ad_advertisers a ON a.id=c.advertiser_id
    JOIN ad_creatives cr ON cr.id=p.creative_id AND cr.campaign_id=c.id
    JOIN ad_talent_ad_policy policy ON policy.user_id=h.user_id
    WHERE p.hat_id=ANY($1::uuid[])
      AND h.active=TRUE AND h.role='talent' AND c.delivery_enabled=TRUE
      AND c.state='active' AND c.start_at<=now() AND c.end_at>now()
      AND c.end_at<=c.start_at+INTERVAL '30 days'
      AND a.status='approved'
      AND p.state='active' AND p.starts_at<=now() AND p.ends_at>now()
      AND cr.state='approved' AND cr.media_type='image'
      AND policy.policy_version=$2 AND policy.accepted_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM ad_campaign_terms terms
        WHERE terms.campaign_id=c.id AND terms.approved_at IS NOT NULL
        AND terms.accepted_at IS NOT NULL
        AND (SELECT COALESCE(SUM(f.amount_naira),0) FROM ad_funding_receipts f
          WHERE f.campaign_id=c.id AND f.status='verified'
          AND f.verified_at IS NOT NULL)>=terms.budget_cap_naira)
      AND EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
        AND m.screening_status IN ('legacy','passed'))
    ORDER BY p.hat_id,p.id LIMIT 120`,[ids,VERSION])
  const grouped=new Map()
  for(const row of rows){
    if(!grouped.has(row.hat_id))grouped.set(row.hat_id,[])
    grouped.get(row.hat_id).push(row)
  }
  const placements={}
  for(const [id,candidates] of grouped){
    // Fair probabilistic shuffle, not billable delivery evidence. A separate
    // audited quota/rotation scheduler is required before launch.
    const pick=candidates[randomInt(candidates.length)]
    placements[id]={id:pick.placement_id,hat_id:id,campaign_id:pick.campaign_id,
      sponsor_name:pick.sponsor_name,image_url:pick.image_url,
      caption:pick.caption||'',ends_at:pick.ends_at}
  }
  return {placements,enabled:true}
}

// Release E is a *preview-only* creative endpoint, independent of actual
// delivery. No counted impressions, money, Orbit or tracking events.
export const videoPreviewEnabled=()=>deliveryEnabled()
  &&process.env.CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED==='true'
  &&process.env.VERCEL_ENV==='preview'

export async function publicShowroomVideoSlots(rawIds){
  if(!videoPreviewEnabled())return {placements:{},enabled:false,billable:false}
  const ids=String(rawIds||'').split(',').filter(Boolean)
  if(!ids.length||ids.length>20||ids.some(id=>!UUID.test(id))||new Set(ids).size!==ids.length)
    throw fail(400,'Provide 1–20 unique Showroom Hat identifiers.')
  if(!await readAvailable())return {placements:{},enabled:false,billable:false}
  const cloud=process.env.CLOUDINARY_CLOUD_NAME||process.env.VITE_CLOUDINARY_CLOUD_NAME
  if(!cloud)return {placements:{},enabled:false,billable:false}
  const {trustedShowroomVideoUrl}=await import('../../shared/showroomAdPolicy.js')
  const {rows}=await query(`SELECT p.id AS placement_id,p.hat_id,p.ends_at,
      a.legal_name AS sponsor_name,cr.media_url AS video_url,cr.caption
    FROM ad_hat_placements p
    JOIN hats h ON h.id=p.hat_id
    JOIN ad_campaigns c ON c.id=p.campaign_id
    JOIN ad_advertisers a ON a.id=c.advertiser_id
    JOIN ad_creatives cr ON cr.id=p.creative_id AND cr.campaign_id=c.id
    JOIN ad_talent_ad_policy policy ON policy.user_id=h.user_id
    WHERE p.hat_id=ANY($1::uuid[])
      AND h.active=TRUE AND h.role='talent' AND h.feed_visible=TRUE
      AND c.delivery_enabled=TRUE AND c.state='active'
      AND c.start_at<=now() AND c.end_at>now()
      AND c.end_at<=c.start_at+INTERVAL '30 days'
      AND a.status='approved'
      AND p.state='active' AND p.starts_at<=now() AND p.ends_at>now()
      AND cr.state='approved' AND cr.media_type='video'
      AND policy.policy_version=$2 AND policy.accepted_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM ad_campaign_terms terms
        WHERE terms.campaign_id=c.id AND terms.approved_at IS NOT NULL
        AND terms.accepted_at IS NOT NULL
        AND (SELECT COUNT(*) FROM ad_campaign_terms t2
          WHERE t2.campaign_id=c.id AND t2.approved_at IS NOT NULL AND t2.accepted_at IS NOT NULL)=1
        AND (SELECT COALESCE(SUM(f.amount_naira),0) FROM ad_funding_receipts f
          WHERE f.campaign_id=c.id AND f.status='verified' AND f.verified_at IS NOT NULL)>=terms.budget_cap_naira)
      AND EXISTS (SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
        AND m.screening_status IN ('legacy','passed'))
    ORDER BY p.hat_id,p.id LIMIT 80`,[ids,VERSION])
  const grouped=new Map()
  for(const row of rows){
    if(!trustedShowroomVideoUrl(row.video_url,cloud))continue
    const list=grouped.get(row.hat_id)||[]
    list.push(row);grouped.set(row.hat_id,list)
  }
  const placements={}
  for(const [id,candidates] of grouped){
    const pick=candidates[randomInt(candidates.length)]
    placements[id]={id:pick.placement_id,hat_id:id,
      sponsor_name:pick.sponsor_name,video_url:pick.video_url,
      caption:pick.caption||'',ends_at:pick.ends_at}
  }
  return {placements,enabled:true,billable:false}
}

export async function talentAdvertisingPolicy(userId){
  if(!await readAvailable())return {available:false,accepted:false,policy_version:VERSION,active:[]}
  const [{rows:accounts},{rows:policies},{rows:placements}]=await Promise.all([
    query('SELECT role FROM users WHERE id=$1',[userId]),
    query('SELECT policy_version,accepted_at FROM ad_talent_ad_policy WHERE user_id=$1',[userId]),
    query(`SELECT p.id,p.hat_id,p.state,p.ends_at,c.title AS campaign_title,a.legal_name AS sponsor_name
      FROM ad_hat_placements p JOIN hats h ON h.id=p.hat_id
      JOIN ad_campaigns c ON c.id=p.campaign_id JOIN ad_advertisers a ON a.id=c.advertiser_id
      WHERE h.user_id=$1 AND p.state IN ('reserved','active') ORDER BY p.created_at DESC LIMIT 60`,[userId])
  ])
  return {available:true,eligible:['talent','dual'].includes(accounts[0]?.role),
    accepted:policies[0]?.policy_version===VERSION,policy_version:VERSION,active:placements}
}
export async function talentAdvertisingAction(userId,body){
  if(!await readAvailable())throw fail(503,'Advertising preferences are not installed yet.')
  if(body.action==='ad_policy_accept'){
    if(body.policy_version!==VERSION||body.agree!==true)
      throw fail(400,'Accept the current automatic advertising policy to continue.')
    const {rows}=await query(`INSERT INTO ad_talent_ad_policy(user_id,policy_version)
      SELECT id,$2 FROM users WHERE id=$1 AND role IN ('talent','dual')
      ON CONFLICT(user_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,
      accepted_at=now(),updated_at=now() RETURNING user_id`,[userId,VERSION])
    if(!rows.length)throw fail(403,'Only Talent accounts can accept ad placement terms.')
    return {accepted:true,policy_version:VERSION}
  }
  if(body.action==='ad_detach'){
    const id=validId(body.placement_id)
    const reason=typeof body.reason==='string'?body.reason.trim():null
    if(reason && reason.length>400)throw fail(400,'Reason is too long.')
    const {rows}=await query(`WITH changed AS (
      UPDATE ad_hat_placements p SET state='detached',detached_at=now()
      FROM hats h WHERE p.hat_id=h.id AND h.user_id=$2
        AND p.id=$1 AND p.state IN ('reserved','active')
      RETURNING p.id
    ), audit AS (
      INSERT INTO ad_placement_detachments(placement_id,talent_id,reason)
      SELECT id,$2,$3 FROM changed ON CONFLICT (placement_id) DO NOTHING
      RETURNING id
    ) SELECT id FROM changed`,[id,userId,reason])
    if(!rows.length){
      const {rows:existing}=await query(`SELECT p.state FROM ad_hat_placements p
        JOIN hats h ON h.id=p.hat_id WHERE p.id=$1 AND h.user_id=$2`,[id,userId])
      if(existing[0]?.state==='detached')return {detached:true,already_detached:true}
      throw fail(404,'Active placement not found for this account.')
    }
    return {detached:true}
  }
  throw fail(400,'Unsupported advertising preference action.')
}
