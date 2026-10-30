// Work Pass: authenticated write operations, public read projections,
// server-only ECDSA signatures. Never trust scores or evidence supplied by a client.
import { query, getClient } from './db.js'
import { accountOrbit } from './accountOrbit.js'
import { trackingPeriodsPaid } from './salaryTrackingFees.js'
import { signedHatMediaEnabled, verifyNewHatMedia, claimHatMediaPermits } from './hatMediaUpload.js'
import { workPassTier, WORK_PASS_DISCLAIMER } from '../../shared/workPass.js'
import { signingPublicKey, signWorkPassClaim } from './workPassSigning.js'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const invalid = (code, message) => Object.assign(new Error(message), { status: code })
const safeString = (value, max=120) => String(value || '').trim().slice(0,max)
export async function workPassKey() {
  return signingPublicKey()
}
async function ensureSchema(){
  const {rows}=await query("SELECT to_regclass('work_pass_evidence') AS evidence, to_regclass('work_pass_robots') AS robots, to_regclass('work_pass_endorsements') AS endorsements")
  if(!rows[0]?.evidence||!rows[0]?.robots||!rows[0]?.endorsements)
    throw invalid(503,'Work Pass tables are not ready. Open Admin → Database Migrations and apply the Work Pass migration.')
}
export async function getWorkPass(username) {
  const clean=safeString(username,30).replace(/^[@^]/,'')
  if(!/^[a-z0-9._-]{3,30}$/i.test(clean))throw invalid(400,'Invalid profile username.')
  const {rows}=await query(
    "SELECT id,username,full_name,role,avatar_url,skills,industry,headline,created_at FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1",
    [clean])
  const user=rows[0]
  if(!user)throw invalid(404,'Work Pass holder not found.')
  const [history,score,schema]=await Promise.all([
    query(`SELECT
      COUNT(*) FILTER(WHERE talent_id=$1 AND status='released')::int AS completed_jobs,
      COUNT(*) FILTER(WHERE client_id=$1 AND status='released')::int AS successful_hires
      FROM escrows WHERE talent_id=$1 OR client_id=$1`,[user.id]),
    accountOrbit(user.id).catch(()=>null),
    query("SELECT to_regclass('work_pass_evidence') AS evidence, to_regclass('work_pass_robots') AS robots, to_regclass('work_pass_endorsements') AS endorsements"),
  ])
  const counts=history.rows[0]||{}
  const completedJobs=Number(counts.completed_jobs||0)
  const successfulHires=Number(counts.successful_hires||0)
  const orbit=score?.score ?? 0
  const roleOrbit=score?.byRole||{
    talent:{score:0,max:100,factors:[]},
    client:{score:0,max:100,factors:[]},
  }
  const paidTrackingMonths=await trackingPeriodsPaid(query,user.id).catch(()=>({talent:0,client:0}))
  const tier=workPassTier(user.role==='client'?successfulHires:completedJobs,orbit)
  const installed=Boolean(schema.rows[0]?.evidence)
  const [evidence, robots, endorsements]=await Promise.all([
    installed?query(`SELECT id,escrow_id,image_url,image_sha256,reviewed_at
      FROM work_pass_evidence WHERE talent_id=$1 AND status='approved'
      ORDER BY reviewed_at DESC LIMIT 60`,[user.id]):Promise.resolve({rows:[]}),
    schema.rows[0]?.robots?query(`SELECT id,display_name,manufacturer,serial_number,capabilities,photo_url,manufacturer_verified
      FROM work_pass_robots WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 20`,[user.id]):Promise.resolve({rows:[]}),
    schema.rows[0]?.endorsements?query(`SELECT i.name AS issuer, e.statement, e.approved_at
      FROM work_pass_endorsements e JOIN work_pass_issuers i ON i.id=e.issuer_id
      WHERE e.subject_id=$1 AND e.approved_at IS NOT NULL AND e.revoked_at IS NULL
        AND i.approved_at IS NOT NULL AND i.revoked_at IS NULL
      ORDER BY e.approved_at DESC LIMIT 20`,[user.id]):Promise.resolve({rows:[]}),
  ])
  const claim={
    id:user.id,username:user.username,role:user.role,name:user.full_name,
    tier,completedJobs,successfulHires,orbit,roleOrbit,paidTrackingMonths,
    issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+7*86400,
  }
  const {token,keyId}=await signWorkPassClaim(claim)
  return {user:{username:user.username,name:user.full_name,role:user.role,avatarUrl:user.avatar_url,
      skills:user.skills||[],industry:user.industry||[],headline:user.headline},
    tier,orbit,completedJobs,successfulHires,rating:null,ratingCount:0,
    claim,token,keyId,
    signatureStatus:token?'signed':'not_configured',disclaimer:WORK_PASS_DISCLAIMER,
    evidence:evidence.rows,robots:robots.rows,endorsements:endorsements.rows,
    evidenceAvailable:installed}
}
export async function submitWorkPassEvidence(userId, body){
  await ensureSchema()
  if(!signedHatMediaEnabled())throw invalid(503,'Signed Hat media uploads must be enforced before submitting proof.')
  if(!uuid.test(body?.escrow_id)||!uuid.test(body?.upload_id))throw invalid(400,'A completed deal and signed upload are required.')
  if(!/^[0-9a-f]{64}$/i.test(body?.sha256||''))throw invalid(400,'A SHA-256 fingerprint is required.')
  const image={upload_id:body.upload_id,public_id:body.public_id,url:body.url,type:'image'}
  const {rows:deals}=await query(`SELECT id,hat_id,talent_id,client_id,status FROM escrows
    WHERE id=$1 AND talent_id=$2`,[body.escrow_id,userId])
  const deal=deals[0]
  if(!deal||deal.status!=='released')throw invalid(409,'Work evidence requires a completed, released deal owned by you.')
  // This checks the upload against Cloudinary's authenticated resource API,
  // avoiding forged URLs or media belonging to another account.
  const verified=await verifyNewHatMedia(userId,[image])
  if(verified.length!==1)throw invalid(422,'Media proof could not be verified.')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows:current}=await client.query('SELECT id,status FROM work_pass_evidence WHERE escrow_id=$1 FOR UPDATE',[deal.id])
    if(current[0]&&current[0].status!=='rejected')throw invalid(409,'This deal already has evidence awaiting or carrying approval.')
    await claimHatMediaPermits(client,userId,deal.hat_id,verified)
    await client.query(`INSERT INTO work_pass_evidence
      (escrow_id,talent_id,client_id,media_upload_id,public_id,image_url,image_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(escrow_id) DO UPDATE
      SET media_upload_id=EXCLUDED.media_upload_id,public_id=EXCLUDED.public_id,
      image_url=EXCLUDED.image_url,image_sha256=EXCLUDED.image_sha256,
      status='pending',client_note=NULL,reviewed_at=NULL,captured_at=NOW()`,
      [deal.id,userId,deal.client_id,image.upload_id,image.public_id,image.url,body.sha256.toLowerCase()])
    await client.query('COMMIT')
    return {status:'pending',message:'Submitted for client approval; not public yet.'}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
export async function reviewWorkPassEvidence(userId,body){
  await ensureSchema()
  if(!uuid.test(body?.escrow_id)||!['approved','rejected'].includes(body?.decision))
    throw invalid(400,'Choose an evidence decision.')
  const note=safeString(body.note,300)
  const {rows}=await query(`UPDATE work_pass_evidence SET status=$3,client_note=$4,reviewed_at=NOW()
    WHERE escrow_id=$1 AND client_id=$2 AND status='pending'
      AND EXISTS(SELECT 1 FROM escrows WHERE id=$1 AND client_id=$2 AND status='released')
    RETURNING id,status`,[body.escrow_id,userId,body.decision,note])
  if(!rows[0])throw invalid(409,'Only the client can review pending evidence for a completed deal.')
  return {status:rows[0].status}
}
export async function registerWorkPassRobot(userId,body){
  await ensureSchema()
  const manufacturer=safeString(body?.manufacturer,80)
  const serial=safeString(body?.serial_number,120)
  const displayName=safeString(body?.display_name,100)
  const capabilities=Array.isArray(body?.capabilities)?body.capabilities.slice(0,12).map(v=>safeString(v,60)).filter(Boolean):[]
  if(manufacturer.length<2||serial.length<3||displayName.length<2)throw invalid(400,'Enter the manufacturer, serial number and robot name.')
  const {rows}=await query(`INSERT INTO work_pass_robots(owner_id,manufacturer,serial_number,display_name,capabilities)
    VALUES($1,$2,$3,$4,$5::text[]) RETURNING id,display_name,manufacturer,serial_number,capabilities,manufacturer_verified`,
    [userId,manufacturer,serial,displayName,capabilities])
  return {robot:rows[0],message:'Robot registered; manufacturer verification is pending.'}
}

export async function getDealWorkPassEvidence(userId,escrowId){
  await ensureSchema()
  if(!uuid.test(escrowId))throw invalid(400,'Invalid deal.')
  const {rows:deal}=await query('SELECT id FROM escrows WHERE id=$1 AND (client_id=$2 OR talent_id=$2)',[escrowId,userId])
  if(!deal.length)throw invalid(404,'Deal not found.')
  const {rows}=await query(`SELECT id,escrow_id,image_url,image_sha256,status,client_note,captured_at,reviewed_at
    FROM work_pass_evidence WHERE escrow_id=$1`,[escrowId])
  return {evidence:rows[0]||null}
}
