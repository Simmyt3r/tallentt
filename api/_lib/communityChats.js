import {query,getClient} from './db.js'
import {notifyUser} from './notifications.js'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const fail=(status,message)=>Object.assign(new Error(message),{status})
const validId=id=>UUID.test(String(id||''))
const cleanBody=value=>typeof value==='string'?value.trim():''
export async function communityChatsGet(userId,params){
  const {rows:exists}=await query("SELECT to_regclass('community_threads') AS present")
  if(!exists[0]?.present)throw fail(503,'Apply the General subscriber chats migration first.')
  // During rollout the existing chat feature must work until the new
  // Associate migration is actually applied by an administrator.
  const {rows:relationshipTable}=await query("SELECT to_regclass('associate_links') AS present")
  const associationEnabled=Boolean(relationshipTable[0]?.present)
  if(params.get('community_users')==='1'){
    const search=String(params.get('q')||'').trim().replace(/^[@^]+/,'').slice(0,48)
    if(search.length<2)return {users:[]}
    const extra=associationEnabled ? `AND EXISTS(SELECT 1 FROM associate_links a WHERE a.status='accepted'
          AND ((a.member_low=$1 AND a.member_high=users.id) OR
               (a.member_high=$1 AND a.member_low=users.id)))` : ''
    const {rows}=await query(`SELECT id,username,full_name,avatar_url
      FROM users WHERE id<>$1 AND username ILIKE $2 ${extra}
      ORDER BY username LIMIT 15`,[userId,'%'+search+'%'])
    return {users:rows}
  }
  const threadId=params.get('community_thread')
  if(threadId){
    if(!validId(threadId))throw fail(400,'Invalid conversation.')
    const {rows:threads}=await query(`SELECT t.id,t.status,t.initiator_id,t.recipient_id,
      u.username AS peer_username,u.full_name AS peer_name
      FROM community_threads t JOIN users u ON u.id=CASE
        WHEN t.initiator_id=$2 THEN t.recipient_id ELSE t.initiator_id END
      WHERE t.id=$1 AND (t.initiator_id=$2 OR t.recipient_id=$2)`,[threadId,userId])
    const thread=threads[0]
    if(!thread)throw fail(404,'Conversation not found.')
    const {rows:messages}=await query(`SELECT id,sender_id,body,created_at
      FROM community_messages WHERE thread_id=$1
      ORDER BY created_at DESC,id DESC LIMIT 100`,[threadId])
    return {thread,messages:messages.reverse()}
  }
  const {rows}=await query(`SELECT t.id,t.initiator_id,t.recipient_id,t.status,
      t.created_at,t.updated_at,u.username AS peer_username,
      u.full_name AS peer_name,u.avatar_url AS peer_avatar,
      (SELECT m.body FROM community_messages m WHERE m.thread_id=t.id
       ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_message,
      (SELECT m.created_at FROM community_messages m WHERE m.thread_id=t.id
       ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_at
      FROM community_threads t
      JOIN users u ON u.id=CASE WHEN t.initiator_id=$1 THEN t.recipient_id ELSE t.initiator_id END
      WHERE t.initiator_id=$1 OR t.recipient_id=$1
      ORDER BY t.updated_at DESC LIMIT 100`,[userId])
  return {threads:rows}
}
export async function communityChatsAction(userId,body){
  const action=body?.action
  if(!['community_start','community_send','community_respond'].includes(action))
    throw fail(400,'Unknown community chat action.')
  if(action==='community_start'){
    const recipientId=body.recipient_id
    const text=cleanBody(body.text)
    if(!validId(recipientId)||recipientId===userId)throw fail(400,'Select a different subscriber.')
    if(text.length<1||text.length>2000)throw fail(400,'Enter a message of 1–2,000 characters.')
    const client=await getClient()
    let target=null
    let thread=null
    try{
      await client.query('BEGIN')
      const {rows:found}=await client.query(`SELECT id,username FROM users WHERE id=$1 FOR SHARE`,[recipientId])
      target=found[0]
      if(!target)throw fail(404,'Subscriber not found.')
      const {rows:installed}=await client.query("SELECT to_regclass('associate_links') AS present")
      if(installed[0]?.present){
        const {rows:associate}=await client.query(`SELECT 1 FROM associate_links
          WHERE status='accepted' AND member_low=LEAST($1::uuid,$2::uuid)
            AND member_high=GREATEST($1::uuid,$2::uuid)`,[userId,recipientId])
        if(!associate.length)throw fail(403,'Connect as mutual Associates on Profile before starting a chat.')
      }
      const {rows:existing}=await client.query(`SELECT * FROM community_threads
        WHERE (initiator_id=$1 AND recipient_id=$2) OR
        (initiator_id=$2 AND recipient_id=$1) FOR UPDATE`,[userId,recipientId])
      if(existing[0]){
        thread=existing[0]
        if(thread.status!=='accepted')throw fail(409,
          'A pending, rejected, or blocked conversation already exists with this subscriber.')
        const {rows:count}=await client.query(`SELECT COUNT(*)::int AS n FROM community_messages
          WHERE sender_id=$1 AND created_at>NOW()-INTERVAL '1 hour'`,[userId])
        if(count[0].n>=60)throw fail(429,'Message rate limit reached.')
      }else{
        const {rows:count}=await client.query(`SELECT COUNT(*)::int AS n FROM community_threads
          WHERE initiator_id=$1 AND created_at>NOW()-INTERVAL '24 hours'`,[userId])
        if(count[0].n>=8)throw fail(429,'You have sent many new chat requests today.')
        const {rows}=await client.query(`INSERT INTO community_threads(initiator_id,recipient_id)
          VALUES($1,$2) RETURNING *`,[userId,recipientId])
        thread=rows[0]
      }
      await client.query(`INSERT INTO community_messages(thread_id,sender_id,body)
        VALUES($1,$2,$3)`,[thread.id,userId,text])
      await client.query('UPDATE community_threads SET updated_at=NOW() WHERE id=$1',[thread.id])
      await client.query('COMMIT')
    }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
    finally{client.release()}
    await notifyUser({userId:recipientId,type:'community_message',
      title:thread.status==='pending'?'New chat request':'New community message',
      body:'A subscriber sent you a message.',linkUrl:'/inbox?tab=associates&thread='+thread.id})
    return {thread_id:thread.id,status:thread.status}
  }
  const threadId=body.thread_id
  if(!validId(threadId))throw fail(400,'Invalid conversation.')
  const client=await getClient()
  let target=null
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`SELECT * FROM community_threads WHERE id=$1
      AND (initiator_id=$2 OR recipient_id=$2) FOR UPDATE`,[threadId,userId])
    const thread=rows[0]
    if(!thread)throw fail(404,'Conversation not found.')
    if(action==='community_respond'){
      const acceptingOrDeclining=['accepted','declined'].includes(body.decision)
      const blocking=body.decision==='blocked'
      if(!acceptingOrDeclining&&!blocking)
        throw fail(400,'Choose accept, decline, or block.')
      if(acceptingOrDeclining&&(thread.recipient_id!==userId||thread.status!=='pending'))
        throw fail(403,'Only the invited subscriber can accept or decline a new request.')
      if(blocking&&thread.status==='blocked')
        throw fail(409,'This conversation is already blocked.')
      const {rows:updated}=await client.query(`UPDATE community_threads
        SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,[threadId,body.decision])
      target=updated[0].initiator_id
    }else{
      if(thread.status!=='accepted')throw fail(403,'Accept the chat request before replying.')
      // If a subscriber blocks or removes an Associate, old chat consent
      // cannot silently override that new explicit choice.
      const {rows:relationsEnabled}=await client.query("SELECT to_regclass('associate_links') AS present")
      if(relationsEnabled[0]?.present){
        const partner=thread.initiator_id===userId?thread.recipient_id:thread.initiator_id
        const {rows:relation}=await client.query(`SELECT status FROM associate_links
          WHERE member_low=LEAST($1::uuid,$2::uuid)
            AND member_high=GREATEST($1::uuid,$2::uuid)`,[userId,partner])
        if(relation.length && relation[0].status!=='accepted')
          throw fail(403,'This Associate connection is no longer active.')
      }
      const text=cleanBody(body.text)
      if(!text||text.length>2000)throw fail(400,'Message must contain 1–2,000 characters.')
      const {rows:rate}=await client.query(`SELECT COUNT(*)::int AS n FROM community_messages
        WHERE sender_id=$1 AND created_at>NOW()-INTERVAL '1 hour'`,[userId])
      if(rate[0].n>=60)throw fail(429,'Message rate limit reached.')
      await client.query(`INSERT INTO community_messages(thread_id,sender_id,body)
        VALUES($1,$2,$3)`,[threadId,userId,text])
      await client.query('UPDATE community_threads SET updated_at=NOW() WHERE id=$1',[threadId])
      target=thread.initiator_id===userId?thread.recipient_id:thread.initiator_id
    }
    await client.query('COMMIT')
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
  if(target)await notifyUser({userId:target,type:'community_message',
    title:action==='community_send'?'New community message':'Chat request response',
    body:action==='community_send'?'You received a message.':'A subscriber responded to your chat request.',
    linkUrl:'/inbox?tab=associates&thread='+threadId})
  return {ok:true}
}
