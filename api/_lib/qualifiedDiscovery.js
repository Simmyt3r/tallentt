// Qualified Discovery must originate from an explicit Hat open and server
// time, with active dwell samples AND a persisted Like/KeepUp/second-Hat
// action. Client clocks, autoplay and scrolling are never qualifying proof.
// This makes casual spoofing harder; it is not an infallible bot detector.
import {getClient,query} from './db.js'
import {requiredMilestoneSchema,awardVerifiedMilestone} from './verifiedMilestones.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const valid=v=>UUID.test(String(v||''))
const bad=(status,message)=>Object.assign(new Error(message),{status})
const appealText=text=>{
  const v=typeof text==='string'?text.trim():''
  if(v.length<20||v.length>1000)throw bad(400,'Explain your appeal in 20–1,000 characters.')
  return v
}

// The Step-3 schema is required before ANY new qualified Discovery is
// processed. Otherwise a Talent could be credited while the discoverer's
// matching Explorer reward is silently omitted.
async function requiredOrbitProofSchema(db){
  const {rows}=await db.query("SELECT to_regclass('orbit_discovery_proof_events') AS proofs, to_regclass('orbit_saved_hats') AS saves")
  if(!rows[0]?.proofs||!rows[0]?.saves)throw bad(503,'Apply Orbit Explorer & Proof in Admin before qualifying Discovery.')
}

// Both awards use the same immutable session source and one transaction.
// Lock the pair in UUID order first, preventing reversed Discovery sessions
// from deadlocking while each user is credited.
async function awardDiscoveryPair(db,session){
  await db.query('SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',[session.viewer_id,session.talent_id])
  const talent=await awardVerifiedMilestone(db,{
    actorId:session.viewer_id,subjectId:session.talent_id,
    beneficiaryId:session.talent_id,lane:'talent',verb:'Discover',sourceId:session.id,
  })
  if(!talent.recorded)return {recorded:false,talent}
  const explorer=await awardVerifiedMilestone(db,{
    actorId:session.viewer_id,subjectId:session.talent_id,
    beneficiaryId:session.viewer_id,lane:'client',verb:'Explorer',sourceId:session.id,
  })
  if(!explorer.recorded)throw bad(409,'Explorer credit could not be recorded alongside Discovery. Retry or contact Admin.')
  return {...talent,explorer:{points:explorer.points,event_id:explorer.event_id}}
}

// An actual saved Hat is a durable, reversible user collection entry.
// Recording a Save never itself awards Orbit; it is only one possible proof.
export async function saveTalentHat(userId,body){
  if(!valid(userId)||!valid(body?.hat_id)||typeof body?.saved!=='boolean')
    throw bad(400,'Choose a valid Hat and Save setting.')
  const client=await getClient()
  try {
    await client.query('BEGIN')
    await requiredMilestoneSchema(client)
    await requiredOrbitProofSchema(client)
    if(body.saved){
      const {rows}=await client.query(`SELECT h.id FROM hats h JOIN users u ON u.id=h.user_id
        WHERE h.id=$1 AND h.role='talent' AND h.active=TRUE AND h.feed_visible=TRUE
          AND u.role IN ('talent','dual') AND h.user_id<>$2
          AND EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id AND m.screening_status IN ('legacy','passed'))
          AND NOT EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
            AND m.screening_status IN ('pending','processing','held','rejected'))
          AND NOT EXISTS(SELECT 1 FROM showroom_review_state sr WHERE sr.hat_id=h.id AND sr.status IN ('flagged','restricted'))`,
        [body.hat_id,userId])
      if(!rows.length)throw bad(403,'Only an approved public Talent Hat can be saved.')
      await client.query('INSERT INTO orbit_saved_hats(user_id,hat_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,body.hat_id])
    }else await client.query('DELETE FROM orbit_saved_hats WHERE user_id=$1 AND hat_id=$2',[userId,body.hat_id])
    await client.query('COMMIT')
    return {saved:body.saved}
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function savedTalentHatStatus(userId,hatId){
  if(!valid(userId)||!valid(hatId))throw bad(400,'Choose a valid saved Hat.')
  await requiredMilestoneSchema()
  await requiredOrbitProofSchema({query})
  const {rows}=await query('SELECT 1 FROM orbit_saved_hats WHERE user_id=$1 AND hat_id=$2',[userId,hatId])
  return {saved:rows.length>0}
}

export async function discoveryAction(actorId,body){
  if(!valid(actorId))throw bad(401,'Sign in before claiming Discovery.')
  const action=String(body?.action||'')
  if(!['discovery_open','discovery_heartbeat','discovery_complete','discovery_appeal','discovery_evidence'].includes(action))
    throw bad(400,'Invalid Discovery action.')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await requiredMilestoneSchema(client)
    await requiredOrbitProofSchema(client)
    if(action==='discovery_open'){
      if(!valid(body.hat_id))throw bad(400,'Choose a visible Talent Hat.')
      const {rows:eligible}=await client.query(`SELECT h.id,h.user_id FROM hats h JOIN users u ON u.id=h.user_id
        WHERE h.id=$1 AND h.role='talent' AND h.active=TRUE AND h.feed_visible=TRUE
          AND u.role IN ('talent','dual') AND h.user_id<>$2
          AND EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
            AND m.screening_status IN ('legacy','passed'))
          AND NOT EXISTS(SELECT 1 FROM hat_media m WHERE m.hat_id=h.id
            AND m.screening_status IN ('pending','processing','held','rejected'))
          AND NOT EXISTS(SELECT 1 FROM showroom_review_state sr
            WHERE sr.hat_id=h.id AND sr.status IN ('flagged','restricted'))`,[body.hat_id,actorId])
      if(!eligible[0])throw bad(403,'Only an eligible Talent Hat may qualify for Discovery.')
      const talentId=eligible[0].user_id
      const {rows:already}=await client.query("SELECT 1 FROM orbit_verified_events WHERE verb='Discover' AND actor_id=$1 AND subject_id=$2",[actorId,talentId])
      if(already.length){await client.query('COMMIT');return {alreadyQualified:true}}
      const {rows:rate}=await client.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE opened_at>NOW()-INTERVAL '1 hour')::int AS hourly
        FROM orbit_discovery_sessions WHERE viewer_id=$1 AND opened_at>NOW()-INTERVAL '24 hours'`,[actorId])
      if(rate[0].total>=100||rate[0].hourly>=40)throw bad(429,'Discovery activity limit reached. Try again later.')
      const {rows}=await client.query(`INSERT INTO orbit_discovery_sessions(viewer_id,talent_id,hat_id)
        VALUES($1,$2,$3) RETURNING id,expires_at`,[actorId,talentId,body.hat_id])
      await client.query('COMMIT')
      return {session_id:rows[0].id,expires_at:rows[0].expires_at}
    }
    if(action==='discovery_appeal'){
      if(!valid(body.session_id))throw bad(400,'Choose the Discovery to appeal.')
      const explanation=appealText(body.explanation)
      const {rows}=await client.query('SELECT * FROM orbit_discovery_sessions WHERE id=$1 FOR UPDATE',[body.session_id])
      const session=rows[0]
      if(!session||![session.viewer_id,session.talent_id].includes(actorId))
        throw bad(404,'Discovery session not found.')
      if(!['held','rejected'].includes(session.state))throw bad(409,'Only held or rejected cases may be appealed.')
      const {rows:prior}=await client.query(`INSERT INTO orbit_discovery_appeals(session_id,submitted_by,explanation)
        VALUES($1,$2,$3) ON CONFLICT(session_id,submitted_by) DO NOTHING RETURNING id`,
        [session.id,actorId,explanation])
      if(!prior.length)throw bad(409,'You already appealed this Discovery.')
      await client.query('COMMIT')
      return {appeal_id:prior[0].id,status:'pending'}
    }
    if(!valid(body.session_id))throw bad(400,'Choose a valid Discovery session.')
    const {rows}=await client.query(`SELECT * FROM orbit_discovery_sessions
      WHERE id=$1 AND viewer_id=$2 FOR UPDATE`,[body.session_id,actorId])
    const session=rows[0]
    if(!session)throw bad(404,'Discovery session not found.')
    if(session.state!=='open'){
      await client.query('COMMIT')
      return {status:session.state,alreadyProcessed:true}
    }
    if(new Date(session.expires_at).getTime()<=Date.now())throw bad(410,'This Discovery session expired. Open the Hat again.')
    if(action==='discovery_evidence'){
      const kind=String(body.kind||'')
      if(!['share','second_media'].includes(kind))throw bad(400,'Choose a supported Discovery proof.')
      if(kind==='share' && body.confirmed!==true)
        throw bad(400,'A successful device share or copied link is required.')
      let mediaId=null
      if(kind==='second_media'){
        if(!valid(body.media_id))throw bad(400,'Choose a valid second media asset.')
        const {rows}=await client.query(`SELECT id FROM hat_media
          WHERE hat_id=$1 AND screening_status IN ('legacy','passed')
            AND type IN ('image','video','audio') ORDER BY created_at,id LIMIT 2`,[session.hat_id])
        if(rows.length<2||rows[1].id!==body.media_id)
          throw bad(400,'Only a deliberately opened second approved media asset qualifies.')
        mediaId=body.media_id
      }
      const {rowCount}=await client.query(`INSERT INTO orbit_discovery_proof_events(session_id,kind,media_id)
        VALUES($1,$2,$3) ON CONFLICT(session_id,kind) DO NOTHING`,
        [session.id,kind,mediaId])
      await client.query('COMMIT')
      return {recorded:rowCount>0,kind}
    }
    if(action==='discovery_heartbeat'){
      // The client-supplied visibility flag is a prerequisite, NOT trusted
      // evidence on its own. Only server timestamps and real action records
      // can complete a Discovery.
      if(body.visible!==true)throw bad(400,'Discovery stays active only while the page is visible.')
      const {rows:updated}=await client.query(`UPDATE orbit_discovery_sessions
        SET first_heartbeat_at=COALESCE(first_heartbeat_at,NOW()),
          last_heartbeat_at=NOW(),heartbeat_count=LEAST(20,heartbeat_count+1)
        WHERE id=$1
          AND (last_heartbeat_at IS NULL OR last_heartbeat_at<=NOW()-INTERVAL '2 seconds')
        RETURNING heartbeat_count`,[session.id])
      await client.query('COMMIT')
      return {accepted:updated.length>0,heartbeats:updated[0]?.heartbeat_count||session.heartbeat_count}
    }
    // Verification of engagement actions is based on recorded account-scoped
    // database facts AFTER the explicit open. No client proof kind is trusted.
    const {rows:actions}=await client.query(`SELECT
      EXISTS(SELECT 1 FROM hat_likes l WHERE l.hat_id=$1 AND l.user_id=$2 AND l.created_at>=$3) AS liked,
      EXISTS(SELECT 1 FROM subscriber_follows f WHERE f.followed_id=$4 AND f.follower_id=$2 AND f.created_at>=$3) AS followed,
      EXISTS(SELECT 1 FROM orbit_discovery_sessions s WHERE s.viewer_id=$2 AND s.talent_id=$4
        AND s.hat_id<>$1 AND s.opened_at>$3) AS second_hat,
      EXISTS(SELECT 1 FROM orbit_saved_hats saved
        WHERE saved.user_id=$2 AND saved.hat_id=$1 AND saved.created_at>=$3) AS saved,
      EXISTS(SELECT 1 FROM orbit_discovery_proof_events pe
        WHERE pe.session_id=$5 AND pe.kind='share' AND pe.created_at>=$3) AS shared,
      EXISTS(SELECT 1 FROM orbit_discovery_proof_events pe
        WHERE pe.session_id=$5 AND pe.kind='second_media' AND pe.created_at>=$3) AS second_media`,
      [session.hat_id,actorId,session.opened_at,session.talent_id,session.id])
    const proof=actions[0].liked?'hat_like'
      :actions[0].followed?'keepup':actions[0].saved?'save'
      :actions[0].shared?'share':actions[0].second_media?'second_media'
      :actions[0].second_hat?'second_hat':null
    if(!proof)throw bad(409,'Like, KeepUp, Save, Share or open a second approved media/Hat to qualify.')
    const {rows:dwell}=await client.query(`SELECT
      NOW()-opened_at>=INTERVAL '5 seconds' AS elapsed,
      heartbeat_count>=2 AND first_heartbeat_at IS NOT NULL
        AND last_heartbeat_at-first_heartbeat_at>=INTERVAL '5 seconds' AS active
      FROM orbit_discovery_sessions WHERE id=$1`,[session.id])
    if(!dwell[0]?.elapsed||!dwell[0]?.active)
      throw bad(409,'Keep the Hat visible for at least five active seconds before completing Discovery.')
    const {rows:fraud}=await client.query(`SELECT
      (SELECT created_at>NOW()-INTERVAL '24 hours' FROM users WHERE id=$1) AS new_account,
      (SELECT COUNT(*)::int FROM orbit_verified_events WHERE actor_id=$1
        AND verb='Discover' AND created_at>NOW()-INTERVAL '24 hours') AS daily_awards,
      (SELECT COUNT(DISTINCT viewer_id)::int FROM orbit_discovery_sessions
        WHERE talent_id=$2 AND opened_at>NOW()-INTERVAL '10 minutes') AS audience_spike`,
      [actorId,session.talent_id])
    let flag=null
    if(fraud[0].new_account)flag='New account requires a manual credibility check'
    else if(fraud[0].daily_awards>=20)flag='Unusual daily Discovery activity'
    else if(fraud[0].audience_spike>=40)flag='Unusual coordinated audience spike'
    if(flag){
      await client.query(`UPDATE orbit_discovery_sessions SET state='held',proof_kind=$2,fraud_reason=$3 WHERE id=$1`,[session.id,proof,flag])
      await client.query('COMMIT')
      return {status:'held',review_required:true}
    }
    const award=await awardDiscoveryPair(client,session)
    if(award.recorded){
      await client.query(`UPDATE orbit_discovery_sessions SET state='awarded',proof_kind=$2 WHERE id=$1`,[session.id,proof])
    }else{
      await client.query(`UPDATE orbit_discovery_sessions SET state='rejected',proof_kind=$2,
        fraud_reason='Discovery already credited for this pair' WHERE id=$1`,[session.id,proof])
    }
    await client.query('COMMIT')
    return {status:award.recorded?'awarded':'rejected',award}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}

export async function myDiscoveryCases(userId){
  await requiredMilestoneSchema()
  const {rows}=await query(`SELECT s.id,s.state,s.fraud_reason,s.proof_kind,s.opened_at,
    v.username AS viewer_username,t.username AS talent_username,
    (SELECT a.status FROM orbit_discovery_appeals a WHERE a.session_id=s.id
     ORDER BY a.created_at DESC LIMIT 1) AS appeal_status
    FROM orbit_discovery_sessions s
    JOIN users v ON v.id=s.viewer_id JOIN users t ON t.id=s.talent_id
    WHERE (s.viewer_id=$1 OR s.talent_id=$1) AND s.state IN ('held','rejected')
    ORDER BY s.opened_at DESC LIMIT 50`,[userId])
  return {cases:rows}
}
export async function adminDiscoveryQueue(){
  await requiredMilestoneSchema()
  const {rows}=await query(`SELECT s.id,s.state,s.fraud_reason,s.proof_kind,
    s.heartbeat_count,s.first_heartbeat_at,s.last_heartbeat_at,
    s.opened_at,s.viewer_id,s.talent_id,s.hat_id,
    v.username AS viewer_username,t.username AS talent_username,
    a.id AS appeal_id,a.explanation AS appeal,a.status AS appeal_status
    FROM orbit_discovery_sessions s JOIN users v ON v.id=s.viewer_id
    JOIN users t ON t.id=s.talent_id
    LEFT JOIN LATERAL (SELECT * FROM orbit_discovery_appeals a
      WHERE a.session_id=s.id ORDER BY a.created_at DESC LIMIT 1) a ON true
    WHERE s.state='held' OR a.status='pending'
    ORDER BY s.opened_at DESC LIMIT 100`)
  return {cases:rows}
}
export async function adminDiscoveryDecision(adminId,body){
  if(!valid(body.session_id)||!['approve','reject'].includes(body.decision))throw bad(400,'Choose a Discovery and decision.')
  const reason=String(body.reason||'').trim()
  if(reason.length<12||reason.length>1000)throw bad(400,'Explain the decision in 12–1,000 characters.')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await requiredMilestoneSchema(client)
    const {rows}=await client.query('SELECT * FROM orbit_discovery_sessions WHERE id=$1 FOR UPDATE',[body.session_id])
    const session=rows[0]
    if(!session||!['held','rejected'].includes(session.state)||!session.proof_kind)
      throw bad(409,'This Discovery is not a reviewed, evidence-backed case.')
    if(body.decision==='approve'){
      await requiredOrbitProofSchema(client)
      const award=await awardDiscoveryPair(client,session)
      if(!award.recorded)throw bad(409,'A different Discovery already used this viewer–Talent pair.')
    }
    await client.query(`UPDATE orbit_discovery_sessions
      SET state=$2,reviewed_at=NOW(),reviewed_by=$3,fraud_reason=$4 WHERE id=$1`,
      [session.id,body.decision==='approve'?'awarded':'rejected',adminId,reason])
    await client.query(`UPDATE orbit_discovery_appeals SET status=$2,admin_id=$3,admin_note=$4,decided_at=NOW()
      WHERE session_id=$1 AND status='pending'`,
      [session.id,body.decision==='approve'?'approved':'denied',adminId,reason])
    await client.query(`INSERT INTO orbit_milestone_decisions(admin_id,discovery_session_id,action,reason)
      VALUES($1,$2,$3,$4)`,[adminId,session.id,body.decision==='approve'?'discovery_approve':'discovery_reject',reason])
    await client.query('COMMIT')
    return {ok:true,status:body.decision==='approve'?'awarded':'rejected'}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
export async function revokeVerifiedAward(adminId,body){
  if(!Number.isSafeInteger(Number(body.event_id))||Number(body.event_id)<=0)
    throw bad(400,'Choose a valid milestone event.')
  const reason=String(body.reason||'').trim()
  if(reason.length<12||reason.length>1000)throw bad(400,'Explain the revocation in 12–1,000 characters.')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await requiredMilestoneSchema(client)
    const {rows}=await client.query('SELECT * FROM orbit_verified_events WHERE id=$1 FOR UPDATE',[body.event_id])
    if(!rows[0]||rows[0].status!=='verified')throw bad(409,'No active milestone event to revoke.')
    await client.query("UPDATE orbit_verified_events SET status='revoked' WHERE id=$1",[body.event_id])
    if(rows[0].verb==='Discover'){
      // Revoke the discoverer's matching Explorer point with the source-linked
      // Talent credit. Do not leave a reward for a fraudulent Discovery.
      const {rows:mirrors}=await client.query(`UPDATE orbit_verified_events SET status='revoked'
        WHERE verb='Explorer' AND source_type='discovery' AND source_id=$1
          AND actor_id=$2 AND subject_id=$3 AND status='verified'
        RETURNING id`,[rows[0].source_id,rows[0].actor_id,rows[0].subject_id])
      for(const event of mirrors)await client.query(`INSERT INTO orbit_milestone_decisions
        (admin_id,event_id,action,reason) VALUES($1,$2,'revoke_award',$3)`,[adminId,event.id,reason])
    }
    await client.query(`INSERT INTO orbit_milestone_decisions(admin_id,event_id,action,reason)
      VALUES($1,$2,'revoke_award',$3)`,[adminId,body.event_id,reason])
    await client.query('COMMIT')
    return {ok:true}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
