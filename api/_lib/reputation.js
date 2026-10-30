import {query,getClient} from './db.js'
const fail=(status,message)=>Object.assign(new Error(message),{status})
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(String(value||''))
export const reputationLevel=points=>Math.floor(Math.sqrt(Math.max(0,Number(points)||0)/100))
export async function reviewJobs(userId,subject){
 if(!uuid(subject)||!await reputationReady())return {jobs:[]}
 const {rows}=await query(`SELECT e.id,h.hat_title FROM escrows e LEFT JOIN hats h ON h.id=e.hat_id
 WHERE e.status='released' AND e.work_status='completed' AND ((e.client_id=$1 AND e.talent_id=$2) OR (e.talent_id=$1 AND e.client_id=$2))
 AND NOT EXISTS(SELECT 1 FROM work_reviews r WHERE r.escrow_id=e.id AND r.reviewer_id=$1) ORDER BY e.released_at DESC LIMIT 100`,[userId,subject])
 return {jobs:rows}
}
export async function reputationReady(){return Boolean((await query("SELECT to_regclass('reputation_events') AS ready")).rows[0]?.ready)}
export async function reputationSummary(userId){
 if(!await reputationReady())return null
 const {rows}=await query('SELECT lane,talent,SUM(points)::int AS points FROM reputation_events WHERE user_id=$1 GROUP BY lane,talent',[userId])
 const score=lane=>{const points=rows.filter(r=>r.lane===lane).reduce((n,r)=>n+r.points,0);return {points,level:reputationLevel(points)}}
 const {rows:ratings}=await query('SELECT lane,AVG(stars)::float AS rating,COUNT(*)::int AS count FROM work_reviews WHERE subject_id=$1 AND hidden_at IS NULL GROUP BY lane',[userId])
 const {rows:reviews}=await query(`SELECT r.id,r.lane,r.talent,r.stars,r.body,r.created_at,u.username AS reviewer_username
 FROM work_reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.subject_id=$1 AND r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT 20`,[userId])
 const {rows:reliability}=await query(`SELECT COUNT(*) FILTER(WHERE p.status='confirmed')::int AS confirmed,
 COUNT(*) FILTER(WHERE p.status='confirmed' AND p.received_on<=p.due_on)::int AS on_time
 FROM employment_salary_periods p JOIN employment_agreements a ON a.id=p.agreement_id WHERE a.employer_id=$1 AND a.publish_status=TRUE`,[userId])
 return {talent:score('talent'),employer:score('employer'),talents:rows.filter(r=>r.lane==='talent'&&r.talent).map(r=>({...r,level:reputationLevel(r.points)})),ratings,reviews,reliability:reliability[0]}
}
export async function reviewAction(userId,body){
 if(!await reputationReady())throw fail(503,'Work reviews are not available yet.')
 const client=await getClient()
 try{
  await client.query('BEGIN')
  if(body.action==='review_hide'){
   const {rows:admin}=await client.query('SELECT is_admin FROM users WHERE id=$1',[userId])
   if(!admin[0]?.is_admin)throw fail(403,'Administrator access required.')
   const reason=typeof body.reason==='string'?body.reason.trim():''
   if(reason.length<12||reason.length>1000||!uuid(body.review_id))throw fail(400,'Provide a review and a moderation reason of 12–1,000 characters.')
   const {rows}=await client.query('SELECT * FROM work_reviews WHERE id=$1 FOR UPDATE',[body.review_id])
   if(!rows.length)throw fail(404,'Review not found.')
   if(!rows[0].hidden_at){
    await client.query('UPDATE work_reviews SET hidden_at=NOW(),moderation_reason=$2,moderated_by=$3 WHERE id=$1',[body.review_id,reason,userId])
    await client.query(`INSERT INTO reputation_events(user_id,lane,talent,source_key,reason,points,reverses_id)
      SELECT user_id,lane,talent,'review-reversal:'||id,'Review removed after moderation',-points,id FROM reputation_events WHERE source_key=$1 ON CONFLICT DO NOTHING`,['review:'+body.review_id])
    await client.query("INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata) VALUES($1,'review_hide','work_review',$2,$3::jsonb)",[userId,body.review_id,JSON.stringify({reason})])
   }
  }else{
   if(body.action!=='review_submit'||!uuid(body.escrow_id)||!Number.isInteger(body.stars)||body.stars<1||body.stars>5)throw fail(400,'Choose a completed job and one to five stars.')
   const message=typeof body.body==='string'?body.body.trim():''
   if(!message||message.length>1000)throw fail(400,'Write a review of 1–1,000 characters. Avoid private pay and contact details.')
   const {rows}=await client.query(`SELECT e.*,h.category FROM escrows e LEFT JOIN hats h ON h.id=e.hat_id WHERE e.id=$1 AND (e.client_id=$2 OR e.talent_id=$2) FOR UPDATE OF e`,[body.escrow_id,userId])
   const deal=rows[0];if(!deal)throw fail(404,'Completed job not found.')
   if(deal.status!=='released'||deal.work_status!=='completed')throw fail(409,'Reviews are available after completed, released work.')
   const lane=userId===deal.client_id?'talent':'employer',subject=lane==='talent'?deal.talent_id:deal.client_id
   const {rows:existing}=await client.query('SELECT stars,body FROM work_reviews WHERE escrow_id=$1 AND reviewer_id=$2',[deal.id,userId])
   if(existing.length){if(existing[0].stars!==body.stars||existing[0].body!==message)throw fail(409,'You have already reviewed this job.');await client.query('COMMIT');return {ok:true}}
   const {rows:reviews}=await client.query('INSERT INTO work_reviews(escrow_id,reviewer_id,subject_id,lane,talent,stars,body) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[deal.id,userId,subject,lane,deal.category||'',body.stars,message])
   if(lane==='talent'&&body.stars===5)await client.query("INSERT INTO reputation_events(user_id,lane,talent,source_key,reason,points) VALUES($1,'talent',$2,$3,'Five-star completed-work review',40) ON CONFLICT DO NOTHING",[subject,deal.category||'','review:'+reviews[0].id])
  }
  await client.query('COMMIT');return {ok:true}
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
