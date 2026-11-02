// ChombuTar account-to-account wallet transfers. No Paystack/bank recipient.
import {getClient,query} from './db.js'
import {debitWallet,creditWallet} from './wallet.js'
import {notifyUser} from './notifications.js'

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const USERNAME=/^[a-z0-9_.-]{3,30}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const amountNumber=value=>{
  // Never round monetary inputs or accept 1e3/decimals/overflow.
  if(!/^[1-9][0-9]*$/.test(String(value??'')))throw bad(400,'Enter a whole-number naira amount.')
  const n=Number(value)
  if(!Number.isSafeInteger(n)||n>2147483647)throw bad(400,'Transfer amount is outside the supported range.')
  return n
}
function cleanUsername(value){
  const clean=String(value||'').trim().replace(/^[@^]/,'')
  if(!USERNAME.test(clean))throw bad(400,'Enter a valid ChombuTar username.')
  return clean
}
function uniqueRecipient(rows,username){
  if(!rows.length)throw bad(404,'No registered ChombuTar account matches that username.')
  const exact=rows.find(row=>row.username===username)
  if(rows.length>1&&!exact)
    throw bad(409,'Multiple accounts match that spelling. Enter the username with exact capitalization.')
  return exact||rows[0]
}
export async function findWalletRecipient(senderId,username){
  const name=cleanUsername(username)
  const {rows}=await query(`SELECT id,username,full_name,role,avatar_url,company_suffix
     FROM users WHERE LOWER(username)=LOWER($1) ORDER BY username LIMIT 2`,[name])
  const person=uniqueRecipient(rows,name)
  if(person.id===senderId)throw bad(400,'You cannot transfer money to yourself.')
  return {id:person.id,username:person.username,full_name:person.full_name,
    role:person.role,avatar_url:person.avatar_url,company_suffix:person.company_suffix}
}
export async function transferWalletBalance(senderId,body){
  const username=cleanUsername(body?.recipient_username)
  const amount=amountNumber(body?.amount)
  const token=String(body?.client_token||'').trim()
  if(!UUID.test(token))throw bad(400,'A valid transfer request token is required.')
  const client=await getClient()
  let result
  try{
    await client.query('BEGIN')
    const {rows:installed}=await client.query("SELECT to_regclass('wallet_transfer_requests') AS rel")
    if(!installed[0]?.rel)throw bad(503,'Apply the Peer Wallet Transfers migration in Admin first.')
    const {rows:recipients}=await client.query(`SELECT id,username,full_name FROM users
      WHERE LOWER(username)=LOWER($1) ORDER BY username LIMIT 2`,[username])
    const recipient=uniqueRecipient(recipients,username)
    if(recipient.id===senderId)throw bad(400,'You cannot transfer money to yourself.')
    // Unique(sender, token) serializes retries, even across separate Vercel
    // instances. The winner commits *both* wallet postings or neither.
    const {rows:inserted}=await client.query(`INSERT INTO wallet_transfer_requests
      (sender_id,recipient_id,client_token,amount) VALUES($1,$2,$3,$4)
      ON CONFLICT (sender_id,client_token) DO NOTHING RETURNING id`,
      [senderId,recipient.id,token,amount])
    if(!inserted.length){
      const {rows:previous}=await client.query(`SELECT id,recipient_id,amount FROM wallet_transfer_requests
        WHERE sender_id=$1 AND client_token=$2`,[senderId,token])
      if(!previous.length)throw bad(409,'Transfer request is being processed. Try checking your wallet.')
      if(previous[0].recipient_id!==recipient.id || Number(previous[0].amount)!==amount)
        throw bad(409,'This transfer request was already used for different details.')
      const {rows:balance}=await client.query('SELECT balance FROM wallets WHERE user_id=$1',[senderId])
      await client.query('COMMIT')
      return {alreadyProcessed:true,transferId:previous[0].id,balance:balance[0]?.balance??0}
    }
    const transferId=inserted[0].id
    // Ensure both lazily-created wallets exist; lock in canonical order to
    // avoid deadlocks between opposite-direction concurrent transfers.
    const ids=[senderId,recipient.id].sort()
    for(const id of ids){
      await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[id])
    }
    await client.query('SELECT user_id FROM wallets WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE',[ids])
    const debitRef=`wallet-transfer:${transferId}:sent`
    const creditRef=`wallet-transfer:${transferId}:received`
    const balance=await debitWallet(client,{userId:senderId,amount,type:'wallet_transfer_sent',reference:debitRef})
    await creditWallet(client,{userId:recipient.id,amount,type:'wallet_transfer_received',reference:creditRef})
    await client.query(`UPDATE wallet_transactions SET transfer_id=$1
      WHERE reference IN($2,$3)`,[transferId,debitRef,creditRef])
    await client.query('COMMIT')
    result={alreadyProcessed:false,transferId,balance,recipient:{id:recipient.id,username:recipient.username,full_name:recipient.full_name},amount}
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  }finally{client.release()}
  // Notification is not allowed to roll back a committed financial movement.
  await notifyUser({userId:result.recipient.id,type:'wallet_transfer_received',
    title:'Wallet transfer received',body:'You received a ChombuTar wallet transfer.',
    linkUrl:'/wallet',metadata:{transfer_id:result.transferId}}).catch(()=>{})
  await notifyUser({userId:senderId,type:'wallet_transfer_sent',
    title:'Wallet transfer completed',body:'Your transfer to @'+result.recipient.username+' was completed.',
    linkUrl:'/wallet',metadata:{transfer_id:result.transferId}}).catch(()=>{})
  return result
}
