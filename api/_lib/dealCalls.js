// Private WebRTC signaling for funded Deals Chat. SDP and ICE are ephemeral,
// scoped to both booking participants and never written into message history.
import {createHmac} from 'node:crypto'
import {query,getClient} from './db.js'
import {notifyUser} from './notifications.js'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const requireUuid=value=>{if(!UUID.test(String(value||'')))throw bad(400,'Invalid call or deal identifier.');return value}

async function ready(){
  const {rows}=await query("SELECT to_regclass('deal_calls') AS name")
  if(!rows[0]?.name)throw bad(503,'Apply the Deals Chat Calls migration in Admin first.')
}
async function closeExpired(){
  await query(`UPDATE deal_calls SET status='expired',ended_at=NOW()
    WHERE status IN ('ringing','accepted') AND expires_at<NOW()`)
  await query(`DELETE FROM deal_call_signals WHERE call_id IN (
    SELECT id FROM deal_calls WHERE status='expired')`)
  await query(`DELETE FROM deal_calls WHERE status IN ('expired','ended','declined')
    AND ended_at<NOW()-INTERVAL '30 days'`)
}

function turnServers(userId){
  const servers=[{urls:'stun:stun.l.google.com:19302'}]
  const raw=process.env.TURN_URLS || ''
  const secret=process.env.TURN_SHARED_SECRET
  const urls=raw.split(',').map(s=>s.trim()).filter(s=>/^(turn|turns):[^ ]{3,150}$/.test(s)).slice(0,3)
  if(secret && urls.length){
    const username=(Math.floor(Date.now()/1000)+7200)+':'+userId
    servers.push({urls,username,credential:createHmac('sha1',secret).update(username).digest('base64')})
  }
  return servers
}

async function allowedDeal(client,userId,escrowId) {
  requireUuid(escrowId)
  const {rows}=await client.query(`SELECT id,client_id,talent_id,status,contacts_unlocked,work_status
    FROM escrows WHERE id=$1 AND (client_id=$2 OR talent_id=$2)`,[escrowId,userId])
  if(!rows.length)throw bad(404,'Deal not found.')
  const deal=rows[0]
  if(deal.status!=='secured' || !deal.contacts_unlocked ||
    ['disputed','completed'].includes(deal.work_status))
    throw bad(409,'Calls are available only for active, funded and unlocked deals that are not disputed.')
  return deal
}

export async function getDealCall(userId,escrowId,after=0) {
  await ready()
  await closeExpired()
  requireUuid(escrowId)
  const seq=Number(after||0)
  if(!Number.isSafeInteger(seq)||seq<0)throw bad(400,'Invalid call cursor.')
  await allowedDeal({query},userId,escrowId)
  const {rows}=await query(`SELECT c.id,c.escrow_id,c.caller_id,c.callee_id,
    c.mode,c.status,c.created_at,c.accepted_at,c.expires_at
    FROM deal_calls c WHERE c.escrow_id=$1 AND c.status IN ('ringing','accepted')
    AND (c.caller_id=$2 OR c.callee_id=$2) ORDER BY c.created_at DESC LIMIT 1`,[escrowId,userId])
  const call=rows[0]||null
  if(!call)return {call:null,signals:[],cursor:seq}
  const {rows:signals}=await query(`SELECT id,sender_id,kind,payload
    FROM deal_call_signals WHERE call_id=$1 AND id>$2 ORDER BY id LIMIT 100`,
    [call.id,seq])
  return {call,signals,cursor:signals.at(-1)?.id||seq,iceServers:turnServers(userId)}
}

export async function dealCallAction(userId,body){
  await ready()
  await closeExpired()
  const action=body.action
  if(action==='start_call'){
    const mode=body.mode
    if(!['audio','video'].includes(mode))throw bad(400,'Choose audio or video calling.')
    const escrowId=requireUuid(body.escrow_id)
    const client=await getClient()
    let newCallId, peerId
    try{
      await client.query('BEGIN')
      const deal=await allowedDeal(client,userId,escrowId)
      const other=deal.client_id===userId?deal.talent_id:deal.client_id
      peerId=other
      const {rows}=await client.query(`INSERT INTO deal_calls
        (escrow_id,caller_id,callee_id,mode) VALUES($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING id`,[escrowId,userId,other,mode])
      if(!rows.length)throw bad(409,'A call is already active for this deal.')
      newCallId=rows[0].id
      await client.query('COMMIT')
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
    finally{client.release()}
    await notifyUser({
      userId:peerId,type:'deal_call',title:mode==='video'?'Incoming video call':'Incoming audio call',
      body:'Open the active Deals Chat conversation to answer. Calls expire if unanswered.',
      linkUrl:'/messages?escrow='+escrowId,metadata:{escrow_id:escrowId,call_id:newCallId},
    })
    return {id:newCallId}
  }
  const callId=requireUuid(body.call_id)
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`SELECT c.*,e.status AS deal_status,
      e.contacts_unlocked,e.work_status
      FROM deal_calls c JOIN escrows e ON e.id=c.escrow_id
      WHERE c.id=$1 AND (c.caller_id=$2 OR c.callee_id=$2) FOR UPDATE OF c`,
      [callId,userId])
    const call=rows[0]
    if(!call)throw bad(404,'Call not found.')
    if(action==='end_call'||action==='decline_call'){
      const target=action==='decline_call'?'declined':'ended'
      if(action==='decline_call'&&call.callee_id!==userId)throw bad(403,'Only the recipient may decline.')
      if(['ringing','accepted'].includes(call.status)){
        await client.query(`UPDATE deal_calls SET status=$2,ended_at=NOW() WHERE id=$1`,[callId,target])
        await client.query('DELETE FROM deal_call_signals WHERE call_id=$1',[callId])
      }
    }else if(action==='accept_call'){
      if(call.callee_id!==userId)throw bad(403,'Only the recipient may answer this call.')
      if(call.status!=='ringing'||new Date(call.expires_at)<=new Date())
        throw bad(409,'This call is no longer ringing.')
      if(call.deal_status!=='secured'||!call.contacts_unlocked||
        ['disputed','completed'].includes(call.work_status))throw bad(409,'This deal no longer permits calls.')
      await client.query(`UPDATE deal_calls SET status='accepted',accepted_at=NOW(),
        expires_at=NOW()+INTERVAL '2 hours' WHERE id=$1`,[callId])
    }else if(action==='call_signal'){
      if(!['ringing','accepted'].includes(call.status))throw bad(409,'Call is no longer active.')
      if(call.deal_status!=='secured'||!call.contacts_unlocked||
        ['disputed','completed'].includes(call.work_status))throw bad(409,'Deal calling is unavailable.')
      const kind=body.kind
      if(!['offer','answer','ice'].includes(kind))throw bad(400,'Invalid call signal.')
      if(kind==='offer'&&userId!==call.caller_id)throw bad(403,'Only the caller may create an offer.')
      if(kind==='answer'&&(userId!==call.callee_id||call.status!=='accepted'))
        throw bad(403,'Only the answering participant may send an answer.')
      const payload=body.payload
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||
        JSON.stringify(payload).length>16000)throw bad(422,'Call signal is too large or malformed.')
      if((kind==='offer'||kind==='answer')&&
        (payload.type!==kind||typeof payload.sdp!=='string'||payload.sdp.length>15000))
        throw bad(422,'Invalid session description.')
      if(kind==='ice'&&
        (typeof payload.candidate!=='string'||payload.candidate.length>4000))
        throw bad(422,'Invalid ICE candidate.')
      const {rows:count}=await client.query('SELECT COUNT(*)::int AS n FROM deal_call_signals WHERE call_id=$1',[callId])
      if(count[0].n>=250)throw bad(429,'Call signaling limit reached. Reconnect to start a new call.')
      await client.query('INSERT INTO deal_call_signals(call_id,sender_id,kind,payload) VALUES($1,$2,$3,$4::jsonb)',
        [callId,userId,kind,JSON.stringify(payload)])
    }else throw bad(400,'Unknown call action.')
    await client.query('COMMIT')
    return {ok:true}
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
