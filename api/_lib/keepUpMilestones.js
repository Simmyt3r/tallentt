// Server-authoritative, forward-only KeepUp ledger.
// Called inside the same database transaction as a real follow/unfollow.
// Never trust caller-supplied Orbit totals, Hat credits, or follower identities.
import {query} from './db.js'

async function installed(db){
  const {rows}=await db.query("SELECT to_regclass('orbit_milestone_events') AS events")
  return Boolean(rows[0]?.events)
}

// The first follow qualifies only for a currently published Talent Hat.
// Prior awards remain auditable even when a Hat is later hidden or removed.
async function eligibleTalent(db,subjectId){
  const {rows}=await db.query(`SELECT 1 FROM users u
    WHERE u.id=$1 AND u.role IN ('talent','dual')
      AND EXISTS (SELECT 1 FROM hats h
        WHERE h.user_id=u.id AND h.role='talent'
          AND h.active=TRUE AND h.feed_visible=TRUE)
    LIMIT 1`,[subjectId])
  return rows.length>0
}

// Serialise on both user records (sorted IDs) in associatesAction, before this
// method, so two parallel follow toggles cannot award or reverse twice.
export async function recordKeepUpTransition(db,actorId,subjectId,isFollowing){
  if(actorId===subjectId || !await installed(db))return {recorded:false}
  const {rows:history}=await db.query(`SELECT id,kind FROM orbit_milestone_events
    WHERE actor_id=$1 AND subject_id=$2 AND verb='KeepUp'
    ORDER BY id DESC LIMIT 1`,[actorId,subjectId])
  const last=history[0]||null
  let kind=null
  if(isFollowing){
    // Existing credited followers can restore the previous point even if the
    // Talent temporarily unpublishes; this never creates a new unlock.
    if(!last && !await eligibleTalent(db,subjectId))return {recorded:false}
    if(!last)kind='award'
    else if(last.kind==='reverse')kind='restore'
  }else if(last && last.kind!=='reverse'){
    kind='reverse'
  }
  if(!kind)return {recorded:false}
  const points=kind==='reverse'?-1:1
  const unlocked=kind==='award'?3:0
  const sourceKey=kind==='award'
    ? `keepup:${actorId}:${subjectId}:first`
    : `keepup:${actorId}:${subjectId}:${kind}:${last.id}`
  const {rowCount}=await db.query(`INSERT INTO orbit_milestone_events
      (actor_id,subject_id,verb,kind,points,hats_unlocked,source_key,related_event_id)
    VALUES($1,$2,'KeepUp',$3,$4,$5,$6,$7)
    ON CONFLICT DO NOTHING`,[actorId,subjectId,kind,points,unlocked,sourceKey,last?.id||null])
  return {recorded:rowCount>0,kind,points,hats_unlocked:unlocked}
}

// No migration -> no invented historical credit, old Orbit stays intact.
// Return a separate component so earned/verified work is not conflated with following.
export async function keepUpOrbitSummary(subjectId){
  if(!await installed({query}))return {points:0,unlocked_hats:0,first_time_pairs:0,enabled:false}
  const {rows}=await query(`SELECT COALESCE(SUM(points),0)::text AS points,
    COALESCE(SUM(hats_unlocked),0)::int AS unlocked_hats,
    COUNT(*) FILTER(WHERE kind='award')::int AS first_time_pairs
    FROM orbit_milestone_events
    WHERE subject_id=$1 AND verb='KeepUp'`,[subjectId])
  return {
    points:Number(rows[0]?.points||0),
    unlocked_hats:Number(rows[0]?.unlocked_hats||0),
    first_time_pairs:Number(rows[0]?.first_time_pairs||0),
    enabled:true,
  }
}
