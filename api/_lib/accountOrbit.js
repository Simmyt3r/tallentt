// Orbit measures observed account activity, not a guarantee of identity,
// trustworthiness or suitability. Engagement likes and page views do not earn points.
import {query,getClient} from './db.js'
import {notifyUser} from './notifications.js'

export const ORBIT_DEFAULTS=Object.freeze({
  profile:15, verification:20, completed_work:25,
  successful_hires:20, contributions:10, tenure:10,
})
export const ORBIT_LABELS=Object.freeze({
  profile:'Profile completeness',verification:'Verified profile evidence',
  completed_work:'Completed paid work',successful_hires:'Successfully funded hires',
  contributions:'Meaningful published activity',tenure:'Account history',
})
const fail=(status,message)=>Object.assign(new Error(message),{status})
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i

export function validateOrbitWeights(weights){
  if(!weights || typeof weights!=='object'||Array.isArray(weights))throw fail(400,'Provide all six Orbit weights.')
  if(Object.keys(weights).sort().join('|')!==Object.keys(ORBIT_DEFAULTS).sort().join('|'))
    throw fail(400,'Orbit must use its six approved activity dimensions.')
  for(const value of Object.values(weights))
    if(!Number.isInteger(value)||value<0||value>40) throw fail(400,'Weights must be whole numbers from 0 to 40.')
  if(Object.values(weights).reduce((sum,n)=>sum+n,0)!==100)
    throw fail(400,'Orbit weights must sum to 100.')
  return weights
}

export async function orbitWeights(){
  const {rows:present}=await query("SELECT to_regclass('orbit_score_config') AS table_name")
  if(!present[0]?.table_name)return {...ORBIT_DEFAULTS}
  const {rows}=await query('SELECT weights FROM orbit_score_config WHERE singleton=TRUE')
  const weights=rows[0]?.weights
  try{return validateOrbitWeights(weights)}catch{return {...ORBIT_DEFAULTS}}
}

const ratio=(count,cap)=>Math.max(0,Math.min(1,Number(count||0)/cap))
export function calculateOrbitScore(metrics,weights=ORBIT_DEFAULTS){
  validateOrbitWeights(weights)
  const normalized={
    profile:Math.min(1,Math.max(0,metrics.completedProfileFields||0)/5),
    verification:metrics.verifiedIdentity===true?1:0,
    completed_work:ratio(metrics.completedWork,5),
    successful_hires:ratio(metrics.successfulHires,4),
    contributions:ratio(metrics.activeDays,10),
    tenure:ratio(metrics.accountAgeDays,365),
  }
  const factors=Object.keys(weights).map(key=>({
    key,label:ORBIT_LABELS[key],earned:Math.round(normalized[key]*weights[key]),
    possible:weights[key],
  }))
  const score=factors.reduce((sum,item)=>sum+item.earned,0)
  return {score:Math.min(100,score),max:100,factors,metrics,
    disclaimer:'An activity-based indicator, not identity verification or a guarantee of reliability.'}
}

export async function accountOrbit(userId){
  if(!UUID.test(String(userId||'')))throw fail(400,'Invalid subscriber.')
  const {rows:users}=await query(`SELECT id,created_at,avatar_url,bio,skills,location,lga,country
    FROM users WHERE id=$1`,[userId])
  const owner=users[0]
  if(!owner)throw fail(404,'Subscriber not found.')
  const {rows:summary}=await query(`SELECT
    (SELECT COUNT(*)::int FROM hats WHERE user_id=$1 AND is_verified=TRUE) AS verified_hats,
    (SELECT COUNT(*)::int FROM escrows WHERE talent_id=$1 AND status='released') AS completed_work,
    (SELECT COUNT(*)::int FROM escrows WHERE client_id=$1 AND status='released') AS successful_hires,
    (SELECT COUNT(DISTINCT created_at::date)::int FROM hats
      WHERE user_id=$1 AND active=TRUE AND feed_visible=TRUE) AS hat_days`,[userId])
  const base=summary[0]
  const optional=await query(`SELECT to_regclass('vibes_posts') AS vibes,
    to_regclass('showroom_gallery_posts') AS gallery`)
  const days=new Set()
  const [hatDays,vibeDays,galleryDays]=await Promise.all([
    query('SELECT DISTINCT created_at::date AS day FROM hats WHERE user_id=$1 AND active=TRUE AND feed_visible=TRUE LIMIT 50',[userId]),
    optional.rows[0].vibes?query(`SELECT DISTINCT created_at::date AS day FROM vibes_posts
      WHERE author_id=$1 AND deleted_at IS NULL AND moderation_status='visible' LIMIT 50`,[userId]):Promise.resolve({rows:[]}),
    optional.rows[0].gallery?query(`SELECT DISTINCT created_at::date AS day FROM showroom_gallery_posts
      WHERE author_id=$1 AND deleted_at IS NULL AND moderation_status='visible' LIMIT 50`,[userId]):Promise.resolve({rows:[]}),
  ])
  for(const item of [...hatDays.rows,...vibeDays.rows,...galleryDays.rows])days.add(String(item.day))
  const completedProfileFields=[
    Boolean(owner.avatar_url),Boolean(owner.bio?.trim()),
    Boolean(owner.skills?.length),Boolean(owner.location||owner.lga),Boolean(owner.country),
  ].filter(Boolean).length
  const metrics={
    completedProfileFields,
    verifiedIdentity:Number(base.verified_hats)>0,
    completedWork:Number(base.completed_work),
    successfulHires:Number(base.successful_hires),
    activeDays:days.size,
    accountAgeDays:Math.max(0,Math.floor((Date.now()-new Date(owner.created_at).getTime())/86400000)),
  }
  return calculateOrbitScore(metrics,await orbitWeights())
}

export async function orbitAdminStatus(){
  const weights=await orbitWeights()
  return {weights,labels:ORBIT_LABELS,reason:'Likes and views are excluded to limit manipulation. A verified Hat is evidence of manual review, not government ID proof.'}
}

export async function saveOrbitWeights(adminId,weights){
  validateOrbitWeights(weights)
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows:ready}=await client.query("SELECT to_regclass('orbit_score_config') AS table_name")
    if(!ready[0]?.table_name)throw fail(503,'Apply the Orbit Score migration first.')
    await client.query(`INSERT INTO orbit_score_config(singleton,weights,updated_by,updated_at)
      VALUES(TRUE,$1::jsonb,$2,NOW()) ON CONFLICT(singleton)
      DO UPDATE SET weights=EXCLUDED.weights,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [JSON.stringify(weights),adminId])
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,metadata)
      VALUES($1,'configure_orbit_score','orbit_score',$2::jsonb)`,
      [adminId,JSON.stringify({weights})])
    await client.query('COMMIT')
    return {weights}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function newHatReviewQueue(){
  const {rows:found}=await query("SELECT to_regclass('hat_data_reviews') AS table_name")
  if(!found[0]?.table_name)throw fail(503,'Apply Orbit Score and Hat data review migration first.')
  const {rows}=await query(`SELECT h.id,h.user_id,h.hat_title,h.hat_name,h.role,
    h.category,h.price_type,h.rate,h.price_min,h.price_max,h.currency,
    h.active,h.feed_visible,h.motto,h.created_at,
    u.username,u.full_name,
    (SELECT COUNT(*)::int FROM hat_media m WHERE m.hat_id=h.id) AS media_count,
    r.decision,r.note,r.reviewed_at
    FROM hats h JOIN users u ON u.id=h.user_id
    LEFT JOIN hat_data_reviews r ON r.hat_id=h.id
    ORDER BY (r.hat_id IS NOT NULL),h.created_at DESC LIMIT 100`)
  return {hats:rows}
}

export async function reviewHatData(adminId,body){
  if(!UUID.test(String(body.hat_id||'')))throw fail(400,'Invalid Hat.')
  if(!['reviewed','needs_changes'].includes(body.decision))throw fail(400,'Choose reviewed or needs_changes.')
  const note=typeof body.note==='string'?body.note.trim():''
  if(note.length>500)throw fail(400,'Review note must not exceed 500 characters.')
  if(body.decision==='needs_changes'&&note.length<12)
    throw fail(400,'Describe the required changes in at least 12 characters.')
  const client=await getClient()
  let owner
  try{
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT id,user_id,hat_title FROM hats WHERE id=$1 FOR UPDATE',[body.hat_id])
    if(!rows.length)throw fail(404,'Hat not found.')
    owner=rows[0]
    await client.query(`INSERT INTO hat_data_reviews(hat_id,decision,note,reviewed_by,reviewed_at)
      VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(hat_id)
      DO UPDATE SET decision=EXCLUDED.decision,note=EXCLUDED.note,
        reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW()`,
      [body.hat_id,body.decision,note,adminId])
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata)
      VALUES($1,'review_hat_data','hat',$2,$3::jsonb)`,
      [adminId,body.hat_id,JSON.stringify({decision:body.decision,note})])
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
  if(body.decision==='needs_changes'){
    await notifyUser({userId:owner.user_id,type:'hat_data_review',
      title:'Your Hat needs an update',
      body:`${owner.hat_title}: ${note.slice(0,360)}`,
      linkUrl:'/create?edit='+owner.id,
      metadata:{hat_id:owner.id},
    })
  }
  return {hat_id:owner.id,decision:body.decision}
}
