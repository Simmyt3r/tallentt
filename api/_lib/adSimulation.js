// Release D2: explicit non-production simulation recording, NEVER real settlement.
// No writes to ad_campaign_settlements, ad_reward_allocations, wallets, wallet_transactions
// or ad_accounting_entries. GET access is Admin-only at the router boundary.
import {query,getClient} from './db.js'
import {adminAdvertisingSettlementPreview} from './adSettlementPreview.js'
import {buildAdSimulationSnapshot} from '../../shared/adSimulationSnapshot.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const validId=value=>{if(typeof value!=='string'||!UUID.test(value))throw bad(400,'Select a valid simulation identifier.');return value}
export const simulationWritable=()=>process.env.CHOMBUTAR_AD_SIMULATION_ENABLED==='true'
  && process.env.VERCEL_ENV==='preview'
async function requiredSchema(db){
  const {rows}=await db.query("SELECT to_regclass('ad_settlement_simulations') AS simulations,to_regclass('ad_settlement_simulation_lines') AS lines,to_regclass('ad_settlement_simulation_reviews') AS reviews")
  if(!rows[0]?.simulations||!rows[0]?.lines||!rows[0]?.reviews)
    throw bad(503,'Advertising simulation migration has not been applied.')
}
const publicRow=r=>({id:r.id,revision:r.revision,fingerprint:r.fingerprint,
  created_at:r.created_at,created_by:r.created_by,
  latest_review:r.latest_review||'not_reviewed'})
export async function adminAdSimulationList(campaignId,db={query}){
  validId(campaignId)
  await requiredSchema(db)
  const {rows}=await db.query(`SELECT s.id,s.revision,s.fingerprint,s.created_at,s.created_by,
     (SELECT v.action FROM ad_settlement_simulation_reviews v WHERE v.simulation_id=s.id
       ORDER BY v.id DESC LIMIT 1) AS latest_review
     FROM ad_settlement_simulations s WHERE s.campaign_id=$1
     ORDER BY s.revision DESC LIMIT 30`,[campaignId])
  return {simulations:rows.map(publicRow),simulation_writes_enabled:simulationWritable(),
    payouts_enabled:false,can_post_wallet:false}
}
export async function adminAdSimulationDetail(simulationId,db={query}){
  validId(simulationId)
  await requiredSchema(db)
  const {rows}=await db.query(`SELECT s.id,s.campaign_id,s.revision,s.fingerprint,s.policy_version,
    s.preview_snapshot,s.blockers,s.created_at,s.created_by,
    (SELECT v.action FROM ad_settlement_simulation_reviews v WHERE v.simulation_id=s.id
      ORDER BY v.id DESC LIMIT 1) AS latest_review
    FROM ad_settlement_simulations s WHERE s.id=$1`,[simulationId])
  if(!rows.length)throw bad(404,'Simulation not found.')
  const {rows:lines}=await db.query(`SELECT ledger_kind,recipient_id,evidence_reference,amount_naira::text AS amount_naira
    FROM ad_settlement_simulation_lines WHERE simulation_id=$1
    ORDER BY ledger_kind,evidence_reference`,[simulationId])
  const {rows:reviews}=await db.query(`SELECT action,note,actor_id,created_at FROM ad_settlement_simulation_reviews
    WHERE simulation_id=$1 ORDER BY id DESC LIMIT 30`,[simulationId])
  return {simulation:{...rows[0],lines,reviews},payouts_enabled:false,
    can_settle:false,can_post_wallet:false,can_authorize_payment:false}
}
export async function createAdminAdSimulation(adminId,campaignId,confirmation,
  {clientFactory=getClient}={}){
  validId(adminId);validId(campaignId)
  if(!simulationWritable())throw bad(403,'Simulation snapshots are enabled on approved preview deployments only.')
  if(confirmation!=='SIMULATE '+campaignId)throw bad(400,'Confirm the exact simulation action.')
  const client=await clientFactory()
  let began=false
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    began=true
    await client.query("SET LOCAL lock_timeout='2500ms'")
    await requiredSchema(client)
    const {rows:campaign}=await client.query('SELECT id FROM ad_campaigns WHERE id=$1 FOR UPDATE',[campaignId])
    if(!campaign.length)throw bad(404,'Advertising campaign not found.')
    const preflight=await adminAdvertisingSettlementPreview(campaignId,client)
    if(!preflight.preview)throw bad(409,'Campaign has no agreed pricing to simulate.')
    const {snapshot,fingerprint,lines}=buildAdSimulationSnapshot(preflight)
    const {rows:exists}=await client.query('SELECT id,revision FROM ad_settlement_simulations WHERE campaign_id=$1 AND fingerprint=$2',
      [campaignId,fingerprint])
    if(exists.length){
      await client.query('COMMIT')
      began=false
      return {id:exists[0].id,revision:exists[0].revision,fingerprint,
        existing:true,simulation_only:true,payouts_enabled:false}
    }
    const {rows:next}=await client.query('SELECT COALESCE(MAX(revision),0)+1 AS next_revision FROM ad_settlement_simulations WHERE campaign_id=$1',
      [campaignId])
    const {rows:created}=await client.query(`INSERT INTO ad_settlement_simulations
      (campaign_id,revision,fingerprint,policy_version,preview_snapshot,blockers,created_by)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id,revision`,
      [campaignId,next[0].next_revision,fingerprint,snapshot.pricing_policy,
        JSON.stringify(snapshot),JSON.stringify(snapshot.blockers),adminId])
    await client.query(`INSERT INTO ad_settlement_simulation_lines
      (simulation_id,ledger_kind,recipient_id,evidence_reference,amount_naira)
      SELECT $1,x.ledger_kind,x.recipient_id,x.evidence_reference,x.amount_naira
      FROM jsonb_to_recordset($2::jsonb) AS x(
        ledger_kind TEXT,recipient_id UUID,evidence_reference TEXT,amount_naira BIGINT)`,
      [created[0].id,JSON.stringify(lines)])
    await client.query('COMMIT')
    began=false
    return {id:created[0].id,revision:created[0].revision,fingerprint,
      existing:false,simulation_only:true,payouts_enabled:false}
  }catch(error){
    if(began)await client.query('ROLLBACK').catch(()=>{})
    throw error
  }finally{client.release()}
}
export async function reviewAdminAdSimulation(adminId,simulationId,action,note,
  {clientFactory=getClient}={}){
  validId(adminId);validId(simulationId)
  if(!simulationWritable())throw bad(403,'Simulation reviews are allowed on preview deployments only.')
  if(!['hold','dispute','reviewed_for_testing'].includes(action))throw bad(400,'Unknown simulation review action.')
  if(typeof note!=='string'||note.trim().length<12||note.trim().length>1000)
    throw bad(400,'Explain the review outcome in 12–1,000 characters.')
  const client=await clientFactory()
  let began=false
  try{
    await client.query('BEGIN')
    began=true
    await requiredSchema(client)
    const {rows:target}=await client.query('SELECT id,created_by FROM ad_settlement_simulations WHERE id=$1 FOR SHARE',[simulationId])
    if(!target.length)throw bad(404,'Simulation not found.')
    if(action==='reviewed_for_testing'&&target[0].created_by===adminId)
      throw bad(403,'A different administrator must review a recorded simulation.')
    const {rows}=await client.query(`INSERT INTO ad_settlement_simulation_reviews
      (simulation_id,actor_id,action,note) VALUES($1,$2,$3,$4) RETURNING id,created_at`,
      [simulationId,adminId,action,note.trim()])
    await client.query('COMMIT')
    began=false
    return {review_id:rows[0].id,action,simulation_only:true,
      payouts_enabled:false,can_post_wallet:false}
  }catch(error){if(began)await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
