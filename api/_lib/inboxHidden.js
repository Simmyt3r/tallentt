// Each participant can remove a private chat from their Inbox without
// destroying a conversation, payment, employment agreement or audit record.
// New activity makes the conversation appear again, matching Bento hiding.
import {query} from './db.js'
import {hideConversation as hideBentoConversation} from './bookingThreads.js'
const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{12}$/i
const fail=(status,message)=>Object.assign(new Error(message),{status})
export async function inboxHiddenEnabled(q=query){
  const {rows}=await q("SELECT to_regclass('inbox_hidden_threads') AS present")
  return Boolean(rows[0]?.present)
}
export async function hideInboxThread(userId,kind,threadId,q=query){
  if(kind==='bento')return hideBentoConversation(userId,threadId)
  if(!['associates','employment'].includes(kind)||!valid.test(String(threadId||'')))
    throw fail(400,'Invalid Inbox conversation.')
  if(!await inboxHiddenEnabled(q))
    throw fail(503,'Apply the Inbox Hidden Threads migration in Admin before removing this chat.')
  const table=kind==='associates'?'community_threads':'employment_agreements'
  const access=kind==='associates'
    ?'(t.initiator_id=$1 OR t.recipient_id=$1)'
    :"(t.employer_id=$1 OR (t.talent_id=$1 AND t.status<>'draft' AND t.employer_accepted_at IS NOT NULL))"
  // SQL identifiers are static, selected from the two allowlisted kinds.
  const {rows}=await q(`INSERT INTO inbox_hidden_threads(user_id,kind,thread_id,hidden_at)
    SELECT $1,$3,t.id,NOW() FROM ${table} t WHERE t.id=$2 AND ${access}
    ON CONFLICT(user_id,kind,thread_id) DO UPDATE SET hidden_at=EXCLUDED.hidden_at
    RETURNING thread_id`,[userId,threadId,kind])
  if(!rows.length)throw fail(404,'Conversation not found.')
  return {hidden:true}
}
