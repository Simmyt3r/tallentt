// Release B: editorial-only advertiser onboarding and campaign review.
// Deliberately excludes payment, campaign activation, reward posting and Orbit.
import {query} from './db.js'
import {validateAdvertiserName,validateCampaignDraft,validateCreative,validateReview,uuid} from '../../shared/adCampaignRules.js'
const fail=(status,message)=>Object.assign(new Error(message),{status})
const requireId=value=>{if(!uuid(value))throw fail(400,'Invalid identifier.');return value}
const noSchema=()=>fail(503,'Advertising setup is pending. Ask Admin to apply Release A and B migrations.')
async function available(){
  const {rows}=await query("SELECT to_regclass('ad_advertisers') AS a,to_regclass('ad_campaigns') AS c,to_regclass('ad_creatives') AS d,to_regclass('ad_review_history') AS r")
  if(!rows[0]?.a||!rows[0]?.c||!rows[0]?.d||!rows[0]?.r)throw noSchema()
}
const fields='id,title,state,target_location,target_work_type,start_at,end_at,created_at,updated_at,review_note'

export async function advertisingGet(userId){
  await available()
  const [{rows:advertisers},{rows:campaigns}]=await Promise.all([
    query('SELECT id,legal_name,status,created_at FROM ad_advertisers WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30',[userId]),
    query(`SELECT c.${fields.replaceAll(',',',c.')},c.advertiser_id,a.legal_name AS advertiser_name,
      (SELECT COUNT(*)::int FROM ad_creatives cr WHERE cr.campaign_id=c.id) AS creative_count,
      (SELECT COUNT(*)::int FROM ad_creatives cr WHERE cr.campaign_id=c.id AND cr.state='approved') AS approved_creatives
      FROM ad_campaigns c JOIN ad_advertisers a ON a.id=c.advertiser_id
      WHERE a.owner_id=$1 ORDER BY c.created_at DESC LIMIT 60`,[userId])
  ])
  return {advertisers,campaigns,commercial_status:'Pricing and payments not yet enabled'}
}
export async function advertisingCreatives(userId,campaignId){
  await available();requireId(campaignId)
  const {rows}=await query(`SELECT cr.id,cr.media_type,cr.media_url,cr.caption,cr.state,cr.review_note,cr.created_at
    FROM ad_creatives cr JOIN ad_campaigns c ON c.id=cr.campaign_id
    JOIN ad_advertisers a ON a.id=c.advertiser_id
    WHERE cr.campaign_id=$1 AND a.owner_id=$2 ORDER BY cr.created_at DESC LIMIT 30`,[campaignId,userId])
  return {creatives:rows}
}
export async function advertisingAction(userId,body){
  await available()
  if(body.action==='ad_register'){
    const name=validateAdvertiserName(body.legal_name)
    const {rows}=await query(`WITH added AS (
      INSERT INTO ad_advertisers(owner_id,legal_name)
      SELECT $1,$2 WHERE (SELECT COUNT(*) FROM ad_advertisers WHERE owner_id=$1)<3
      ON CONFLICT DO NOTHING RETURNING id
    ) SELECT id FROM added UNION ALL
    SELECT id FROM ad_advertisers WHERE owner_id=$1 AND lower(btrim(legal_name))=lower($2)
    LIMIT 1`,[userId,name])
    if(!rows.length)throw fail(409,'Advertiser already exists or the registration limit was reached.')
    return {advertiser_id:rows[0].id,status:'pending'}
  }
  if(body.action==='ad_create'){
    const data=validateCampaignDraft(body)
    const advertiserId=requireId(body.advertiser_id),requestKey=requireId(body.request_key)
    const {rows}=await query(`WITH added AS (
      INSERT INTO ad_campaigns(advertiser_id,title,target_location,target_work_type,request_key)
      SELECT id,$3,$4,$5,$6 FROM ad_advertisers
      WHERE id=$1 AND owner_id=$2 AND status IN ('pending','approved')
        AND (SELECT COUNT(*) FROM ad_campaigns WHERE advertiser_id=$1)<30
      ON CONFLICT DO NOTHING RETURNING id
    ) SELECT id FROM added UNION ALL
    SELECT c.id FROM ad_campaigns c JOIN ad_advertisers a ON a.id=c.advertiser_id
    WHERE c.advertiser_id=$1 AND a.owner_id=$2 AND c.request_key=$6 LIMIT 1`,
    [advertiserId,userId,data.title,data.location,data.workType,requestKey])
    if(!rows.length)throw fail(403,'Advertiser is unavailable or not owned by this account.')
    return {campaign_id:rows[0].id,state:'draft'}
  }
  if(body.action==='ad_edit'){
    const data=validateCampaignDraft(body),id=requireId(body.campaign_id)
    const {rows}=await query(`UPDATE ad_campaigns c SET title=$3,target_location=$4,
      target_work_type=$5,updated_at=now(),review_note=NULL
      FROM ad_advertisers a WHERE a.id=c.advertiser_id AND a.owner_id=$1
      AND c.id=$2 AND c.state='draft' RETURNING c.id`,
    [userId,id,data.title,data.location,data.workType])
    if(!rows.length)throw fail(409,'Only your draft campaign can be edited.')
    return {campaign_id:id,state:'draft'}
  }
  if(body.action==='ad_creative_add'){
    const id=requireId(body.campaign_id)
    const data=validateCreative(body,(process.env.CLOUDINARY_CLOUD_NAME||process.env.VITE_CLOUDINARY_CLOUD_NAME))
    const {rows}=await query(`WITH added AS (
      INSERT INTO ad_creatives(campaign_id,media_type,media_url,caption)
      SELECT c.id,$3,$4,$5 FROM ad_campaigns c
      JOIN ad_advertisers a ON a.id=c.advertiser_id
      WHERE c.id=$1 AND a.owner_id=$2 AND c.state='draft'
        AND (SELECT COUNT(*) FROM ad_creatives WHERE campaign_id=$1)<5
      ON CONFLICT DO NOTHING RETURNING id
    ) SELECT id FROM added UNION ALL
    SELECT cr.id FROM ad_creatives cr JOIN ad_campaigns c ON c.id=cr.campaign_id
    JOIN ad_advertisers a ON a.id=c.advertiser_id
    WHERE cr.campaign_id=$1 AND a.owner_id=$2 AND c.state='draft' AND cr.media_url=$4 LIMIT 1`,
    [id,userId,data.type,data.url,data.caption])
    if(!rows.length)throw fail(409,'Creative can only be added to your draft.')
    return {creative_id:rows[0].id,state:'pending'}
  }
  if(body.action==='ad_submit'){
    const id=requireId(body.campaign_id)
    const {rows}=await query(`WITH updated AS (
      UPDATE ad_campaigns c SET state='under_review',updated_at=now(),review_note=NULL
      FROM ad_advertisers a WHERE a.id=c.advertiser_id
      AND c.id=$1 AND a.owner_id=$2 AND a.status='approved' AND c.state='draft'
      AND EXISTS (SELECT 1 FROM ad_creatives cr WHERE cr.campaign_id=c.id)
      RETURNING c.id
    ), history AS (
      INSERT INTO ad_review_history(object_type,object_id,decision,actor_id,note)
      SELECT 'campaign',id,'submitted',$2,'' FROM updated RETURNING id
    ) SELECT id FROM updated`,[id,userId])
    if(!rows.length)throw fail(409,'Campaign must be a draft with creative, under an approved advertiser.')
    return {campaign_id:id,state:'under_review'}
  }
  throw fail(400,'Unsupported advertising action.')
}
export async function adminAdvertisingQueue(){
  await available()
  const [{rows:advertisers},{rows:campaigns},{rows:creatives}]=await Promise.all([
    query(`SELECT a.id,a.legal_name,a.status,a.created_at,u.username AS owner_username FROM ad_advertisers a
      JOIN users u ON u.id=a.owner_id WHERE a.status='pending' ORDER BY a.created_at LIMIT 40`),
    query(`SELECT c.id,c.title,c.state,c.target_location,c.target_work_type,c.created_at,
      a.legal_name,u.username AS owner_username,
      (SELECT COUNT(*)::int FROM ad_creatives cr WHERE cr.campaign_id=c.id AND cr.state='approved') AS approved_creatives
      FROM ad_campaigns c JOIN ad_advertisers a ON a.id=c.advertiser_id
      JOIN users u ON u.id=a.owner_id WHERE c.state='under_review' ORDER BY c.created_at LIMIT 40`),
    query(`SELECT cr.id,cr.campaign_id,cr.media_type,cr.media_url,cr.caption,
      cr.created_at,c.title AS campaign_title
      FROM ad_creatives cr JOIN ad_campaigns c ON c.id=cr.campaign_id
      WHERE cr.state='pending' AND c.state IN ('draft','under_review')
      ORDER BY cr.created_at LIMIT 40`)
  ])
  return {advertisers,campaigns,creatives,payments_enabled:false}
}
export async function adminAdvertisingReview(adminId,body){
  await available()
  const {kind,id,decision,note}=validateReview(body)
  const tables={
    advertiser:{table:'ad_advertisers',old:"pending",col:'status'},
    creative:{table:'ad_creatives',old:'pending',col:'state'},
    campaign:{table:'ad_campaigns',old:'under_review',col:'state'}
  }
  const meta=tables[kind],state=decision==='approved'?'approved':'rejected'
  let condition=''
  if(kind==='campaign')condition=` AND EXISTS (
    SELECT 1 FROM ad_advertisers a WHERE a.id=ad_campaigns.advertiser_id AND a.status='approved')
    AND EXISTS(SELECT 1 FROM ad_creatives cr WHERE cr.campaign_id=ad_campaigns.id AND cr.state='approved')`
  const {rows}=await query(`WITH changed AS (
     UPDATE ${meta.table} SET ${meta.col}=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4
     WHERE id=$1 AND ${meta.col}=$5 ${condition} RETURNING id
   ), history AS (
     INSERT INTO ad_review_history(object_type,object_id,decision,actor_id,note)
     SELECT $6,id,$2,$3,$4 FROM changed RETURNING id
   ) SELECT id FROM changed`,[id,state,adminId,note,meta.old,kind])
  if(!rows.length)throw fail(409,'Already reviewed, or prerequisite advertiser/creative approval is missing.')
  return {id,kind,state,commercial_status:'Payments disabled until pricing and settlement approval'}
}
