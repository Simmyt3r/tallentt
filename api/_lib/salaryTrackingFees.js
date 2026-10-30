import {query} from './db.js'
import {debitWallet,creditWallet} from './wallet.js'
const error=(status,message)=>Object.assign(new Error(message),{status})
const METHODS=['bank_transfer','cash','escrow']
export async function salaryTrackingPrices(q=query){
  const {rows:present}=await q("SELECT to_regclass('salary_tracking_prices') AS present")
  if(!present[0]?.present)return null
  const {rows}=await q('SELECT method,fee_naira,updated_at FROM salary_tracking_prices ORDER BY method')
  return Object.fromEntries(rows.map(r=>[r.method,r.fee_naira==null?null:Number(r.fee_naira)]))
}
export function fixedSalaryQuote(prices,method){
  if(!METHODS.includes(method))throw error(400,'Choose a salary tracking method.')
  if(!prices)throw error(503,'Apply the Dual-role Billing migration in Admin to enable tracking fees.')
  const fee=prices[method]
  if(!Number.isSafeInteger(fee)||fee<1)throw error(409,'Admin has not set a fixed monthly tracking fee for this method.')
  return {currency:'NGN',method,eachParty:fee,combined:fee*2,feeType:'fixed_monthly'}
}
export async function adminSalaryPrice(adminId,{method,fee_naira}){
  if(!METHODS.includes(method))throw error(400,'Unsupported salary tracking method.')
  const amount=Number(fee_naira)
  if(!Number.isSafeInteger(amount)||amount<1||amount>2_000_000)
    throw error(400,'Tracking fees must be fixed whole-naira amounts between ₦1 and ₦2,000,000.')
  const {getClient}=await import('./db.js')
  const client=await getClient()
  try{
    await client.query('BEGIN')
    const {rows:old}=await client.query('SELECT fee_naira FROM salary_tracking_prices WHERE method=$1 FOR UPDATE',[method])
    if(!old.length)throw error(503,'Apply the Dual-role Billing migration in Admin.')
    await client.query('UPDATE salary_tracking_prices SET fee_naira=$2,updated_by=$3,updated_at=NOW() WHERE method=$1',[method,amount,adminId])
    await client.query(`INSERT INTO admin_audit_logs(admin_id,action,target_type,metadata)
      VALUES($1,'salary_tracking_price','salary_tracking',$2::jsonb)`,[
      adminId,JSON.stringify({method,previous:old[0].fee_naira,next:amount}),
    ])
    await client.query('COMMIT')
    return {method,fee_naira:amount}
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
  finally{client.release()}
}
// Caller holds the employment agreement lock and an open transaction.
export async function collectTrackingSide(client,{periodId,side,payerId,fee}){
  if(!['client','talent'].includes(side))throw error(400,'Invalid salary tracking role.')
  if(!Number.isSafeInteger(fee)||fee<1)throw error(409,'This salary month has no approved fixed fee.')
  const {rows:found}=await client.query(`SELECT status FROM salary_tracking_contributions
    WHERE period_id=$1 AND side=$2 FOR UPDATE`,[periodId,side])
  if(found[0]?.status==='paid')throw error(409,'This participant already paid the monthly tracking fee.')
  const reference='salary-track:'+periodId+':'+side+':'+Date.now()
  await debitWallet(client,{userId:payerId,amount:fee,type:'billing_charge',reference})
  if(found.length){
    await client.query(`UPDATE salary_tracking_contributions SET amount=$3,payer_id=$4,reference=$5,
      paid_at=NOW(),status='paid',refunded_at=NULL WHERE period_id=$1 AND side=$2`,
      [periodId,side,fee,payerId,reference])
  }else{
    await client.query(`INSERT INTO salary_tracking_contributions
      (period_id,side,payer_id,amount,reference) VALUES($1,$2,$3,$4,$5)`,
      [periodId,side,payerId,fee,reference])
  }
  return {fee,reference}
}
export async function refundTrackingSides(client,periodId){
  const {rows}=await client.query(`SELECT * FROM salary_tracking_contributions
    WHERE period_id=$1 AND status='paid' FOR UPDATE`,[periodId])
  for(const row of rows){
    await creditWallet(client,{userId:row.payer_id,amount:row.amount,type:'billing_refund',reference:'refund:'+row.reference})
    await client.query(`UPDATE salary_tracking_contributions SET status='refunded',refunded_at=NOW()
      WHERE id=$1`,[row.id])
  }
  return rows.length
}
export async function trackingPeriodsPaid(q,personId){
  const prices=await salaryTrackingPrices(q)
  if(!prices)return {talent:0,client:0}
  const {rows}=await q(`SELECT
    COUNT(*) FILTER(WHERE a.talent_id=$1)::int AS talent,
    COUNT(*) FILTER(WHERE a.employer_id=$1)::int AS client
    FROM employment_salary_periods p JOIN employment_agreements a ON a.id=p.agreement_id
    WHERE p.status='confirmed' AND (a.talent_id=$1 OR a.employer_id=$1)
      AND EXISTS(SELECT 1 FROM salary_tracking_contributions c
                 WHERE c.period_id=p.id AND c.side='client' AND c.status='paid')
      AND EXISTS(SELECT 1 FROM salary_tracking_contributions t
                 WHERE t.period_id=p.id AND t.side='talent' AND t.status='paid')`,[personId])
  return {talent:rows[0]?.talent||0,client:rows[0]?.client||0}
}
