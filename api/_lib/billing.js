import { query, getClient } from './db.js'
import {salaryTrackingPrices} from './salaryTrackingFees.js'
import { debitWallet, creditWallet } from './wallet.js'
import { BUSINESS_VERIFICATION_FEE_NGN, CLIENT_PLANS, TALENT_PLANS } from '../../shared/monetization.js'

const fail=(status,message)=>Object.assign(new Error(message),{status})
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const requireUuid=value=>{if(!UUID.test(String(value||'')))throw fail(400,'A valid request ID is required.');return value}
const requireBilling=async(db=query)=>{
  const {rows}=await db("SELECT to_regclass('billing_charge_events') AS billing")
  if(!rows[0]?.billing)throw fail(503,'Apply the Monetization migration in Admin before using billing.')
}
const asText=(value,label,max)=>{
  if(typeof value!=='string'||value.trim().length<2||value.trim().length>max)
    throw fail(400,label+' is required.')
  return value.trim()
}
function validAudience(a){if(!['talent','client'].includes(a))throw fail(400,'Choose Talent or Client subscriptions.');return a}
function validPlan(a,code){
  validAudience(a)
  if(!(a==='talent'?TALENT_PLANS:CLIENT_PLANS).some(p=>p.id===code&&p.id!=='free'))
    throw fail(400,'Unknown paid plan.')
  return code
}
async function actor(client,userId){
  const {rows}=await client.query('SELECT id,role,is_admin,is_business_verified FROM users WHERE id=$1 FOR NO KEY UPDATE',[userId])
  if(!rows.length)throw fail(401,'Account not found.')
  return rows[0]
}
function roleAllows(user,a){return a==='talent'?['talent','dual'].includes(user.role):['client','dual'].includes(user.role)}
export async function billingOverview(userId){
  await requireBilling()
  const {rows:prices}=await query('SELECT audience,plan_code,monthly_naira,enabled FROM billing_plan_prices')
  const {rows:subscriptions}=await query(`SELECT DISTINCT ON (audience)
      audience,plan_code,purchased_at,expires_at
      FROM account_paid_plans
      WHERE user_id=$1 AND expires_at>NOW()
      ORDER BY audience,expires_at DESC`,[userId])
  const {rows:verification}=await query(`SELECT id,legal_name,registration_number,status,review_note,requested_at,reviewed_at
    FROM business_verification_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1`,[userId])
  const {rows:account}=await query('SELECT role,is_business_verified FROM users WHERE id=$1',[userId])
  const list=(a,catalog)=>catalog.map(p=>{
    const saved=prices.find(v=>v.audience===a&&v.plan_code===p.id)
    return {...p,amountNaira:p.id==='free'?0:saved?.monthly_naira??null,
      available:p.id==='free'||Boolean(saved?.enabled&&saved?.monthly_naira)}
  })
  return {talentPlans:list('talent',TALENT_PLANS),clientPlans:list('client',CLIENT_PLANS),
    subscriptions,verification:verification[0]||null,
    isBusinessVerified:account[0]?.is_business_verified===true,
    accountRole:account[0]?.role,verificationPrice:BUSINESS_VERIFICATION_FEE_NGN}
}

export async function buySubscription(userId,body){
  const audience=validAudience(body.audience),code=validPlan(audience,body.plan)
  const token=requireUuid(body.request_id)
  await requireBilling()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const user=await actor(client,userId)
    if(!roleAllows(user,audience))throw fail(403,'Your account is not eligible for that plan.')
    const reference='subscription:'+token
    const {rows:previous}=await client.query(`SELECT id FROM billing_charge_events
      WHERE reference=$1 AND user_id=$2 AND kind='subscription'`,[reference,userId])
    if(previous.length){
      await client.query('COMMIT');return {alreadyProcessed:true}
    }
    const {rows:prices}=await client.query(`SELECT monthly_naira,enabled FROM billing_plan_prices
      WHERE audience=$1 AND plan_code=$2 FOR SHARE`,[audience,code])
    const price=prices[0]
    if(!price?.enabled||!Number.isSafeInteger(price.monthly_naira)||price.monthly_naira<1)
      throw fail(409,'This plan has not been priced and activated by Admin.')
    if(Number(body.expected_amount)!==price.monthly_naira)
      throw fail(409,'The subscription price changed. Refresh and review before paying.')
    // No auto-renewal without an explicit authorization. A renewal extends
    // the current expiration and requires a fresh wallet debit.
    const {rows:latest}=await client.query(`SELECT expires_at FROM account_paid_plans
      WHERE user_id=$1 AND audience=$2 ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,[userId,audience])
    const {rows:purchased}=await client.query(`INSERT INTO account_paid_plans
      (user_id,audience,plan_code,amount_paid,purchased_at,expires_at,payment_reference)
      VALUES($1,$2,$3,$4,NOW(),GREATEST(NOW(),COALESCE($5::timestamptz,NOW()))+INTERVAL '1 month',$6)
      RETURNING expires_at`,[userId,audience,code,price.monthly_naira,latest[0]?.expires_at||null,reference])
    await debitWallet(client,{userId,amount:price.monthly_naira,type:'billing_charge',reference})
    await client.query(`INSERT INTO billing_charge_events(user_id,kind,source_id,amount,reference)
      VALUES($1,'subscription',$2,$3,$4)`,[userId,token,price.monthly_naira,reference])
    await client.query('COMMIT')
    return {plan:code,audience,amount:price.monthly_naira,expiresAt:purchased[0].expires_at}
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}

export async function requestBusinessVerification(userId,body){
  const token=requireUuid(body.request_id)
  const legalName=asText(body.legal_name,'Registered business name',180)
  const registrationNumber=asText(body.registration_number,'CAC registration number',64)
  if(!/^[\p{L}\p{N} .,'()&/-]+$/u.test(legalName)
     ||!/^[\p{L}\p{N}/._-]+$/u.test(registrationNumber))
    throw fail(400,'Use your legal business name and registration number.')
  await requireBilling()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const user=await actor(client,userId)
    // A verified business may provide services or hire. Account role is
    // independent of official business registration.
    const reference='verification:'+token
    const {rows:previous}=await client.query(`SELECT id FROM billing_charge_events
      WHERE user_id=$1 AND reference=$2 AND kind='business_verification'`,[userId,reference])
    if(previous.length){await client.query('COMMIT');return {alreadyProcessed:true}}
    if(user.is_business_verified)throw fail(409,'This account is already verified.')
    const {rows:pending}=await client.query(`SELECT id FROM business_verification_requests WHERE user_id=$1 AND status='pending' FOR UPDATE`,[userId])
    if(pending.length)throw fail(409,'Your verification request is already awaiting review.')
    // Debit the quoted service fee but do not grant a verified badge until
    // an admin reviews the registration. Rejections refund to the wallet.
    const {rows:request}=await client.query(`INSERT INTO business_verification_requests
      (user_id,legal_name,registration_number) VALUES($1,$2,$3) RETURNING id`,
      [userId,legalName,registrationNumber])
    await debitWallet(client,{userId,amount:BUSINESS_VERIFICATION_FEE_NGN,
      type:'billing_charge',reference})
    const {rows:charge}=await client.query(`INSERT INTO billing_charge_events
      (user_id,kind,source_id,amount,reference) VALUES($1,'business_verification',$2,$3,$4)
      RETURNING id`,[userId,request[0].id,BUSINESS_VERIFICATION_FEE_NGN,reference])
    await client.query('UPDATE business_verification_requests SET charge_event_id=$2 WHERE id=$1',[request[0].id,charge[0].id])
    await client.query('COMMIT')
    return {id:request[0].id,status:'pending',amount:BUSINESS_VERIFICATION_FEE_NGN}
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}

export async function adminBillingStatus(){
  await requireBilling()
  const {rows:prices}=await query('SELECT audience,plan_code,monthly_naira,enabled,updated_at FROM billing_plan_prices ORDER BY audience,plan_code')
  const {rows:queue}=await query(`SELECT b.id,b.user_id,b.legal_name,b.registration_number,b.status,b.requested_at,
      u.username,u.full_name FROM business_verification_requests b JOIN users u ON u.id=b.user_id
      WHERE b.status='pending' ORDER BY b.requested_at ASC LIMIT 75`)
  return {prices,requests:queue}
}

export async function adminPlanPrice(adminId,body){
  const audience=validAudience(body.audience),code=validPlan(audience,body.plan)
  const amount=Number(body.amount)
  if(!Number.isSafeInteger(amount)||amount<1||amount>2_147_483_647)
    throw fail(400,'Enter a positive monthly price in whole naira.')
  const enabled=body.enabled===true
  await requireBilling()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows:old}=await client.query(`SELECT monthly_naira,enabled FROM billing_plan_prices
      WHERE audience=$1 AND plan_code=$2 FOR UPDATE`,[audience,code])
    if(!old.length)throw fail(404,'Subscription plan not found.')
    const {rows}=await client.query(`UPDATE billing_plan_prices SET monthly_naira=$3,enabled=$4,updated_by=$5,
      updated_at=NOW() WHERE audience=$1 AND plan_code=$2 RETURNING audience,plan_code,monthly_naira,enabled`,
      [audience,code,amount,enabled,adminId])
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,metadata)
      VALUES($1,'billing_plan_price','subscription',$2::jsonb)`,
      [adminId,JSON.stringify({audience,code,previous:old[0],next:rows[0]})])
    await client.query('COMMIT')
    return {plan:rows[0]}
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}
  finally{client.release()}
}
export async function adminReviewBusiness(adminId,body){
  const requestId=requireUuid(body.request_id)
  if(!['approved','rejected'].includes(body.decision))throw fail(400,'Approve or reject the verification.')
  const note=typeof body.note==='string'?body.note.trim():null
  if(note?.length>500)throw fail(400,'Review note must be at most 500 characters.')
  if(body.decision==='rejected'&&!note)throw fail(400,'Explain why the application was rejected.')
  await requireBilling()
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows}=await client.query(`SELECT b.*,c.amount,c.status AS charge_status,c.reference
      FROM business_verification_requests b JOIN billing_charge_events c ON c.id=b.charge_event_id
      WHERE b.id=$1 FOR UPDATE OF b,c`,[requestId])
    const request=rows[0]
    if(!request)throw fail(404,'Request not found.')
    if(request.status!=='pending')throw fail(409,'This application was already reviewed.')
    await client.query(`UPDATE business_verification_requests SET status=$2,review_note=$3,
      reviewed_by=$4,reviewed_at=NOW() WHERE id=$1`,[requestId,body.decision,note,adminId])
    if(body.decision==='approved'){
      await client.query('UPDATE users SET is_business_verified=TRUE WHERE id=$1',[request.user_id])
    }else{
      await creditWallet(client,{userId:request.user_id,amount:request.amount,
        type:'billing_refund',reference:'refund:'+request.reference})
      await client.query(`UPDATE billing_charge_events SET status='refunded',refunded_at=NOW()
        WHERE id=$1`,[request.charge_event_id])
    }
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,metadata)
      VALUES($1,'business_verification_review','user',$2,$3::jsonb)`,
      [adminId,request.user_id,JSON.stringify({request_id:requestId,decision:body.decision,review_note:note})])
    await client.query('COMMIT')
    return {id:requestId,status:body.decision,refunded:body.decision==='rejected'}
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
