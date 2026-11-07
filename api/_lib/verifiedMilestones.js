// Immutable, source-linked milestone awards. Never accept scores or credit
// amounts from a browser. Called only after source evidence is verified.
import {query} from './db.js'

export const MILESTONE_POLICY=Object.freeze({
  Showcase:{points:0.1,slots:0,source:'hat'},
  Discover:{points:1,slots:2,source:'discovery'},
  Book:{points:5,slots:10,source:'escrow'},
  Collab:{points:3,slots:6,source:'escrow'},
  Hire:{points:10,slots:10,source:'employment'},
  Sponsor:{points:5,slots:10,source:'wallet_transfer'},
})
// Explorer belongs to the discoverer, but is not an eighth Seven-Verbs
// milestone and never unlocks extra Hat slots.
const EXPLORER_BONUS=Object.freeze({points:1,slots:0,source:'discovery'})
const verbs=Object.keys(MILESTONE_POLICY)
const missing=()=>Object.assign(new Error('Apply the Verified Orbit milestones migration in Admin first.'),{status:503})

export async function verifiedMilestonesReady(db={query}){
  const {rows}=await db.query("SELECT to_regclass('orbit_verified_events') AS installed")
  return Boolean(rows[0]?.installed)
}
export async function requiredMilestoneSchema(db={query}){
  if(!await verifiedMilestonesReady(db))throw missing()
}

export async function awardVerifiedMilestone(db,{actorId,subjectId,beneficiaryId,lane,verb,sourceId}){
  const policy=verb==='Explorer'?EXPLORER_BONUS:MILESTONE_POLICY[verb]
  if(!policy||!['talent','client'].includes(lane)||!actorId||!subjectId||!beneficiaryId||!sourceId)
    throw new TypeError('Invalid trusted milestone source.')
  if(!await verifiedMilestonesReady(db))return {recorded:false,available:false}
  // This user lock also serializes independent events competing for the
  // per-verb 10-slot cap with Hat creation. Caller must own a transaction.
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[beneficiaryId])
  const {rows:previous}=await db.query(`SELECT id FROM orbit_verified_events
    WHERE verb=$1 AND beneficiary_id=$2 AND source_type=$3 AND source_id=$4`,
    [verb,beneficiaryId,policy.source,sourceId])
  if(previous.length)return {recorded:false,alreadyRecorded:true}
  if(verb==='Showcase'){
    // One Showcase cycle = the first ten baseline Hat slots, plus one
    // additional ten-slot tranche for every ten verified unlock credits.
    // Partial unlocks permit their Hat creations but do not reset the +1.0
    // Showcase ceiling. Count revoked rows too to prevent revoke/re-award
    // farming. Caller already holds this subscriber's row lock.
    const allowance=await hatAllowance(beneficiaryId,db)
    const unlocked=Object.entries(allowance.credits)
      .filter(([key])=>key!=='Showcase')
      .reduce((sum,[,count])=>sum+Number(count||0),0)
    const maxAwards=10*(1+Math.floor(unlocked/10))
    const {rows:spent}=await db.query(`SELECT COUNT(*)::int AS n FROM orbit_verified_events
      WHERE beneficiary_id=$1 AND verb='Showcase'`,[beneficiaryId])
    if(Number(spent[0]?.n||0)>=maxAwards)
      return {recorded:false,reason:'Showcase cycle cap reached',max_points:maxAwards/10}
  }
  // The same actor–Talent pair receives promotional unlocks only once per
  // verb; later completed paid jobs still earn independently documented points.
  const {rows:priorPair}=await db.query(`SELECT 1 FROM orbit_verified_events
    WHERE verb=$1 AND beneficiary_id=$2 AND actor_id=$3 AND subject_id=$4
      AND hats_unlocked>0 LIMIT 1`,[verb,beneficiaryId,actorId,subjectId])
  const {rows:quota}=await db.query(`SELECT COALESCE(SUM(hats_unlocked),0)::int AS total
    FROM orbit_verified_events WHERE beneficiary_id=$1 AND verb=$2 AND status='verified'`,
    [beneficiaryId,verb])
  const available=Math.max(0,10-Number(quota[0]?.total||0))
  const slots=priorPair.length?0:Math.min(policy.slots,available)
  const {rows}=await db.query(`INSERT INTO orbit_verified_events
    (actor_id,subject_id,beneficiary_id,lane,verb,source_type,source_id,points,hats_unlocked)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT DO NOTHING RETURNING id`,
    [actorId,subjectId,beneficiaryId,lane,verb,policy.source,sourceId,policy.points,slots])
  return {recorded:rows.length>0,event_id:rows[0]?.id,points:policy.points,hats_unlocked:slots}
}

export async function milestoneOrbitSummary(userId,db={query}){
  if(!await verifiedMilestonesReady(db))return {enabled:false,points:0,talent_points:0,client_points:0,by_verb:[]}
  const {rows}=await db.query(`SELECT verb,lane,
    COALESCE(SUM(points),0)::text AS points,
    COALESCE(SUM(hats_unlocked),0)::int AS slots,
    COUNT(*)::int AS events FROM orbit_verified_events
    WHERE beneficiary_id=$1 AND status='verified'
    GROUP BY verb,lane ORDER BY verb,lane`,[userId])
  return {enabled:true,
    points:rows.reduce((n,r)=>n+Number(r.points),0),
    talent_points:rows.filter(r=>r.lane==='talent').reduce((n,r)=>n+Number(r.points),0),
    client_points:rows.filter(r=>r.lane==='client').reduce((n,r)=>n+Number(r.points),0),
    by_verb:rows}
}

// Existing users get their pre-migration Hat count grandfathered. New users
// begin with 10. Each verb grants a maximum of ten extra lifetime slots,
// never a daily reset; revoked awards cannot extend the allowance.
export async function hatAllowance(userId,db={query}){
  await requiredMilestoneSchema(db)
  const {rows:baseline}=await db.query('SELECT baseline_slots FROM orbit_hat_allowances WHERE user_id=$1',[userId])
  const foundation=Number(baseline[0]?.baseline_slots||10)
  const {rows:used}=await db.query('SELECT COUNT(*)::int AS n FROM hats WHERE user_id=$1',[userId])
  const {rows:verified}=await db.query(`SELECT verb,LEAST(10,COALESCE(SUM(hats_unlocked),0))::int AS slots
    FROM orbit_verified_events WHERE beneficiary_id=$1 AND status='verified'
    GROUP BY verb`,[userId])
  const {rows:keepUp}=await db.query("SELECT to_regclass('orbit_milestone_events') AS table_name")
  let keepUpCredits=0
  if(keepUp[0]?.table_name){
    const {rows}=await db.query(`SELECT LEAST(10,COALESCE(SUM(hats_unlocked),0))::int AS slots
      FROM orbit_milestone_events WHERE subject_id=$1 AND verb='KeepUp'`,[userId])
    keepUpCredits=Number(rows[0]?.slots||0)
  }
  const slotsByVerb=Object.fromEntries([...verbs,'KeepUp'].map(v=>[v,v==='KeepUp'?keepUpCredits:0]))
  for(const row of verified)slotsByVerb[row.verb]=Number(row.slots)
  const total=foundation+Object.values(slotsByVerb).reduce((a,b)=>a+b,0)
  const count=Number(used[0]?.n||0)
  return {enabled:true,baseline:foundation,used:count,total,remaining:Math.max(0,total-count),credits:slotsByVerb}
}

export async function enforceHatAllowance(db,userId){
  if(!await verifiedMilestonesReady(db))throw missing()
  // Lock the subscriber, not only the allowance row: every concurrent Hat
  // creation or award for this user holds the same canonical mutex.
  const {rows:owner}=await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])
  if(!owner.length)throw Object.assign(new Error('Account not found.'),{status:404})
  await db.query(`INSERT INTO orbit_hat_allowances(user_id,baseline_slots)
    VALUES($1,10) ON CONFLICT DO NOTHING`,[userId])
  const allowance=await hatAllowance(userId,db)
  if(allowance.remaining<=0)
    throw Object.assign(new Error('Your Hat allowance is full. Earn verified milestones to unlock additional slots.'),{
      status:409,code:'HAT_ALLOWANCE_REACHED'})
  return allowance
}

// Existing escrow money movements are never performed here. Call inside
// the same transaction AFTER status+work completion and payment release.
export async function awardCompletedBooking(db,escrowId){
  if(!await verifiedMilestonesReady(db))return {recorded:false,available:false}
  const {rows}=await db.query(`SELECT e.id,e.client_id,e.talent_id FROM escrows e
    WHERE e.id=$1 AND e.status='released' AND e.work_status='completed' AND e.released_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM wallet_transactions wt
        WHERE wt.escrow_id=e.id AND wt.user_id=e.talent_id
          AND wt.type IN ('escrow_release','escrow_start') AND wt.status='success')
    LIMIT 1`,[escrowId])
  const record=rows[0]
  if(!record)return {recorded:false,reason:'Not a paid completed job'}
  return awardVerifiedMilestone(db,{actorId:record.client_id,subjectId:record.talent_id,
    beneficiaryId:record.talent_id,lane:'talent',verb:'Book',sourceId:record.id})
}

export async function awardPublishedShowcase(db,hatId){
  if(!await verifiedMilestonesReady(db))return {recorded:false,available:false}
  const {rows}=await db.query(`SELECT h.id,h.user_id FROM hats h
    WHERE h.id=$1 AND h.role='talent' AND h.active=TRUE AND h.feed_visible=TRUE
      AND EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id AND m.screening_status IN ('legacy','passed'))
      AND NOT EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
        AND m.screening_status IN ('pending','processing','held','rejected'))`,[hatId])
  if(!rows[0])return {recorded:false,reason:'Not a cleared published Hat'}
  return awardVerifiedMilestone(db,{actorId:rows[0].user_id,subjectId:rows[0].user_id,
    beneficiaryId:rows[0].user_id,lane:'talent',verb:'Showcase',sourceId:hatId})
}
