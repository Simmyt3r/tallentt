// The Seal is a two-party, versioned-in-practice in-app acceptance of a
// specific already recorded source. It does not create or move money and is
// not a substitute for a legally qualified e-signature provider.
import {getClient,query} from './db.js'
import {awardVerifiedMilestone,requiredMilestoneSchema} from './verifiedMilestones.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const valid=value=>UUID.test(String(value||''))

async function sourceEvidence(db,verb,sourceId){
  let rows=[]
  if(verb==='Collab'){
    ({rows}=await db.query(`SELECT e.client_id,e.talent_id FROM escrows e
      WHERE e.id=$1 AND e.status='released' AND e.work_status='completed' AND e.released_at IS NOT NULL
        AND EXISTS(SELECT 1 FROM wallet_transactions wt WHERE wt.escrow_id=e.id AND wt.user_id=e.talent_id
          AND wt.status='success' AND wt.type IN ('escrow_release','escrow_start'))`,[sourceId]))
  }else if(verb==='Hire'){
    ({rows}=await db.query(`SELECT a.employer_id AS client_id,a.talent_id FROM employment_agreements a
      WHERE a.id=$1 AND a.status IN ('active','ended') AND a.accepted_version=a.version
        AND a.employer_accepted_at IS NOT NULL AND a.talent_accepted_at IS NOT NULL
        AND EXISTS(SELECT 1 FROM employment_salary_periods p
          WHERE p.agreement_id=a.id AND p.status='confirmed' AND p.confirmed_at IS NOT NULL)`,[sourceId]))
  }else if(verb==='Sponsor'){
    ({rows}=await db.query(`SELECT w.sender_id AS client_id,w.recipient_id AS talent_id
      FROM wallet_transfer_requests w JOIN users u ON u.id=w.recipient_id
      WHERE w.id=$1 AND u.role IN ('talent','dual')
        AND EXISTS(SELECT 1 FROM wallet_transactions t
          WHERE t.transfer_id=w.id AND t.user_id=w.sender_id
            AND t.type='wallet_transfer_sent' AND t.status='success' AND t.amount=w.amount)
        AND EXISTS(SELECT 1 FROM wallet_transactions t
          WHERE t.transfer_id=w.id AND t.user_id=w.recipient_id
            AND t.type='wallet_transfer_received' AND t.status='success' AND t.amount=w.amount)`,[sourceId]))
  }
  return rows[0]||null
}

export async function getMilestoneSeals(userId){
  await requiredMilestoneSchema()
  const {rows}=await query(`SELECT id,verb,source_id,client_id,talent_id,created_by,
    client_signed_at,talent_signed_at,sealed_at,status,created_at
    FROM orbit_seals WHERE client_id=$1 OR talent_id=$1
    ORDER BY created_at DESC LIMIT 100`,[userId])
  return {seals:rows}
}

export async function milestoneSealAction(userId,body){
  if(!valid(userId))throw bad(401,'Sign in to confirm a milestone.')
  if(!['seal_create','seal_sign','seal_cancel'].includes(body.action))throw bad(400,'Choose a Seal action.')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    await requiredMilestoneSchema(client)
    if(body.action==='seal_create'){
      if(!['Collab','Hire','Sponsor'].includes(body.verb)||!valid(body.source_id))
        throw bad(400,'Select a supported Seal and verified source.')
      const source=await sourceEvidence(client,body.verb,body.source_id)
      if(!source)throw bad(409,'This source has not met the verified work or funding requirements.')
      if(![source.client_id,source.talent_id].includes(userId)||source.client_id===source.talent_id)
        throw bad(403,'Only the two source participants can sign.')
      // First participant's acceptance is locked in at creation.
      const clientSigned=userId===source.client_id
      const {rows}=await client.query(`INSERT INTO orbit_seals
        (verb,source_id,client_id,talent_id,created_by,client_signed_at,talent_signed_at)
        VALUES($1,$2,$3,$4,$5,
          CASE WHEN $6 THEN NOW() ELSE NULL END,
          CASE WHEN $6 THEN NULL ELSE NOW() END)
        ON CONFLICT (verb,source_id) DO NOTHING RETURNING id`,
        [body.verb,body.source_id,source.client_id,source.talent_id,userId,clientSigned])
      if(!rows[0])throw bad(409,'This source already has a Seal. Open the existing Seal to review.')
      await client.query('COMMIT')
      return {seal_id:rows[0].id,status:'pending'}
    }
    if(!valid(body.seal_id))throw bad(400,'Choose a valid Seal.')
    const {rows}=await client.query('SELECT * FROM orbit_seals WHERE id=$1 FOR UPDATE',[body.seal_id])
    const seal=rows[0]
    if(!seal||![seal.client_id,seal.talent_id].includes(userId))throw bad(404,'Seal not found.')
    if(seal.status==='sealed'){
      if(body.action==='seal_sign'){await client.query('COMMIT');return {seal_id:seal.id,status:'sealed',alreadyProcessed:true}}
      throw bad(409,'An accepted Seal cannot be cancelled. Contact Admin about an evidence dispute.')
    }
    if(seal.status==='cancelled')throw bad(409,'This Seal was cancelled. It cannot be reused.')
    if(body.action==='seal_cancel'){
      if(userId!==seal.created_by)throw bad(403,'Only the creator can cancel a pending Seal.')
      await client.query("UPDATE orbit_seals SET status='cancelled' WHERE id=$1",[seal.id])
      await client.query('COMMIT')
      return {seal_id:seal.id,status:'cancelled'}
    }
    const source=await sourceEvidence(client,seal.verb,seal.source_id)
    if(!source || source.client_id!==seal.client_id || source.talent_id!==seal.talent_id)
      throw bad(409,'Verified source is no longer eligible. No rewards were issued.')
    const column=userId===seal.client_id?'client_signed_at':'talent_signed_at'
    if(seal[column])throw bad(409,'You already signed this Seal. The other participant must confirm.')
    const {rows:updated}=await client.query(`UPDATE orbit_seals SET ${column}=NOW(),
      status=CASE WHEN ${column.replace('_signed_at','')==='client'?'talent_signed_at':'client_signed_at'} IS NOT NULL
        THEN 'sealed' ELSE 'pending' END,
      sealed_at=CASE WHEN ${column.replace('_signed_at','')==='client'?'talent_signed_at':'client_signed_at'} IS NOT NULL
        THEN NOW() ELSE NULL END
      WHERE id=$1 RETURNING *`,[seal.id])
    const ready=updated[0].status==='sealed'
    const awards=[]
    if(ready){
      const actorId=seal.client_id,subjectId=seal.talent_id
      if(seal.verb==='Collab'||seal.verb==='Hire'){
        awards.push(await awardVerifiedMilestone(client,{actorId,subjectId,
          beneficiaryId:seal.client_id,lane:'client',verb:seal.verb,sourceId:seal.source_id}))
      }
      awards.push(await awardVerifiedMilestone(client,{actorId,subjectId,
        beneficiaryId:seal.talent_id,lane:'talent',verb:seal.verb,sourceId:seal.source_id}))
    }
    await client.query('COMMIT')
    return {seal_id:seal.id,status:updated[0].status,awards}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
