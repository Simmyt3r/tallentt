import {query} from './db.js'

// Reads default to public only until the Admin privacy migration is applied.
// Once present, all rules are enforced server-side at the write boundary.
const allowed=Object.freeze({
  showroom_inquiries:new Set(['everyone','verified_clients','nobody']),
  vibes_comments:new Set(['everyone','associates','nobody']),
})
const fail=(status,message)=>Object.assign(new Error(message),{status})
const sqlName='subscriber_content_privacy'
export async function privacyInstalled(q=query){
  const {rows}=await q("SELECT to_regclass('subscriber_content_privacy') AS relation")
  return Boolean(rows[0]?.relation)
}
export async function getContentPrivacy(userId,q=query){
  if(!await privacyInstalled(q))return {installed:false,showroom_inquiries:'everyone',vibes_comments:'everyone'}
  const {rows}=await q('SELECT showroom_inquiries,vibes_comments FROM subscriber_content_privacy WHERE user_id=$1',[userId])
  return {installed:true,showroom_inquiries:rows[0]?.showroom_inquiries||'everyone',
    vibes_comments:rows[0]?.vibes_comments||'everyone'}
}
export async function updateContentPrivacy(userId,field,value,q=query){
  if(!Object.hasOwn(allowed,field)||!allowed[field].has(value))throw fail(400,'Invalid privacy preference.')
  if(!await privacyInstalled(q))throw fail(503,'Apply Subscriber Content Privacy in Admin database migrations first.')
  // Static allowlisted SQL identifier; never interpolate a browser-provided key.
  const {rows}=await q(`INSERT INTO subscriber_content_privacy(user_id,${field},updated_at)
    VALUES($1,$2,NOW()) ON CONFLICT(user_id)
    DO UPDATE SET ${field}=EXCLUDED.${field},updated_at=NOW()
    RETURNING showroom_inquiries,vibes_comments`,[userId,value])
  return {installed:true,...rows[0]}
}
export async function assertShowroomInquiryAllowed(ownerId,clientId,q=query){
  if(ownerId===clientId)return
  const policy=(await getContentPrivacy(ownerId,q)).showroom_inquiries
  if(policy==='nobody')throw fail(403,'This talent has paused new Showroom hiring inquiries.')
  if(policy==='verified_clients'){
    // to_jsonb supports deployments with and without the optional
    // monetization verification column. Never treat an absent flag as verified.
    const {rows}=await q(`SELECT role,
      (to_jsonb(u)->>'is_business_verified')='true' AS verified
      FROM users u WHERE id=$1`,[clientId])
    if(!rows[0]||!['client','dual'].includes(rows[0].role)||rows[0].verified!==true)
      throw fail(403,'Only verified client accounts may start a new inquiry with this talent.')
  }
}
export async function assertVibesCommentAllowed(ownerId,commenterId,q=query){
  if(ownerId===commenterId)return
  // A blocked Associate relationship also blocks new social comments.
  const {rows:table}=await q("SELECT to_regclass('associate_links') AS relation")
  let associated=false
  if(table[0]?.relation){
    const {rows}=await q(`SELECT status FROM associate_links
      WHERE member_low=LEAST($1::uuid,$2::uuid)
        AND member_high=GREATEST($1::uuid,$2::uuid) LIMIT 1`,[ownerId,commenterId])
    if(rows[0]?.status==='blocked')throw fail(403,'You cannot comment on this subscriber\'s Vibe.')
    associated=rows[0]?.status==='accepted'
  }
  const policy=(await getContentPrivacy(ownerId,q)).vibes_comments
  if(policy==='nobody')throw fail(403,'This subscriber has limited comments on their Vibes.')
  if(policy==='associates'&&!associated)
    throw fail(403,'Only accepted Associates can comment on this Vibe.')
}
