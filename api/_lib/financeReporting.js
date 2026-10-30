import {query} from './db.js'

// Financial reporting uses only actual database records, never balance
// arithmetic or assumed escrow commissions. Read-only: no funds are moved.
export async function financeSummary(){
  const [{rows:liability},{rows:tables}]=await Promise.all([
    query(`SELECT
      (SELECT COALESCE(SUM(balance::bigint),0)::text FROM wallets) AS wallet_liability,
      (SELECT COALESCE(SUM(GREATEST(amount::bigint -
        COALESCE(start_released_amount,0)::bigint,0)),0)::text
        FROM escrows WHERE status='secured') AS escrow_liability,
      (SELECT COUNT(*)::int FROM escrows WHERE status='secured') AS secured_deals,
      (SELECT COUNT(*)::int FROM booking_disputes WHERE status='open') AS open_disputes,
      (SELECT COALESCE(SUM(amount::bigint),0)::text FROM wallet_transactions
        WHERE type='withdrawal' AND status='pending') AS pending_withdrawal_liability`),
    query("SELECT to_regclass('live_support_transactions') AS live_support, to_regclass('gig_fee_events') AS gig_fees, to_regclass('billing_charge_events') AS billing_fees, to_regclass('gig_commission_adjustments') AS gig_adjustments"),
  ])
  const exists=Boolean(tables[0]?.live_support)
  let live=null
  if(exists){
    const {rows}=await query(`SELECT
      COALESCE(SUM(platform_fee::bigint),0)::text AS accrued_fees,
      COALESCE(SUM(gross_amount::bigint),0)::text AS support_gross,
      COUNT(*)::int AS transactions
      FROM live_support_transactions WHERE status='success'`)
    live=rows[0]
  }
  let gig=null,billing=null
  if(tables[0]?.gig_fees){
    const {rows}=await query(`SELECT COALESCE(SUM(fee_amount::bigint),0)::text AS accrued_fees,
      COUNT(*)::int AS transactions FROM gig_fee_events`)
    gig=rows[0]
    if(tables[0]?.gig_adjustments){
      const {rows:adjustments}=await query(`SELECT COALESCE(SUM(commission_reversed::bigint),0)::text AS reversals FROM gig_commission_adjustments`)
      gig={...gig,accrued_fees:(BigInt(gig.accrued_fees||0)-BigInt(adjustments[0]?.reversals||0)).toString(),
        commission_reversals:adjustments[0]?.reversals||'0'}
    }
  }
  if(tables[0]?.billing_fees){
    const {rows}=await query(`SELECT kind,
      COALESCE(SUM(amount::bigint),0)::text AS charged_fees,
      COUNT(*)::int AS transactions FROM billing_charge_events
      WHERE status='charged' GROUP BY kind`)
    billing=rows
  }
  const billingStream=(kind,name)=>(()=>{
    const row=billing?.find(item=>item.kind===kind)
    return {id:kind,name,source:'billing_charge_events',recorded:billing!==null,
      inflow:billing!==null?(row?.charged_fees||'0'):null,transactions:billing!==null?(row?.transactions||0):null}
  })()
  return {
    currency:'NGN',
    liabilities:liability[0],
    income_streams:[
      {id:'live_support',name:'Live support platform fees',source:'live_support_transactions',
        recorded:exists,inflow:live?.accrued_fees??null,transactions:live?.transactions??null},
      {id:'deal_fees',name:'Released gig commissions (5% on new deals)',source:'gig_fee_events',
        recorded:gig!==null,inflow:gig?.accrued_fees??null,transactions:gig?.transactions??null},
      billingStream('salary_tracking','Salary tracking charges (subject to confirmation)'),
      billingStream('salary_tracking_talent','Talent-side salary tracking charges (subject to confirmation)'),
      billingStream('business_verification','Business verification review fees'),
      billingStream('subscription','Subscription collections (deferred-service accounting required)'),
      {id:'sponsorships',name:'Sponsorship and other income',source:'not reconciled in this release',
        recorded:false,inflow:null,transactions:null},
    ],
    recognized_revenue: live!==null||gig!==null
      ? (BigInt(live?.accrued_fees||0)+BigInt(gig?.accrued_fees||0)).toString() : null,
    recognized_revenue_partial:true,
    net_profit:null,
    warning:'Recognized revenue includes Live support and released-gig fees where recorded. Subscription collections are NOT counted as earned service revenue pending deferral policy. Salary and verification charges may be refundable or subject to recognition timing. No tax, settlement, processor-cost or net-profit reconciliation is implied.',
  }
}
export async function financeAudit({stream='live_support',cursor=null}={}){
  if(stream!=='live_support')
    throw Object.assign(new Error('An accrual audit is not yet available for this income stream.'),{status:400})
  const {rows:found}=await query("SELECT to_regclass('live_support_transactions') AS present")
  if(!found[0]?.present)return {transactions:[],next_cursor:null,recorded:false}
  const regex=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
  if(cursor&&!regex.test(cursor))
    throw Object.assign(new Error('Invalid audit cursor.'),{status:400})
  const {rows}=await query(`SELECT st.id,st.stream_id,st.supporter_id,st.talent_id,
     st.gross_amount,st.platform_fee,st.net_amount,st.status,st.created_at,
     s.username AS supporter_username,t.username AS talent_username
     FROM live_support_transactions st
     LEFT JOIN users s ON s.id=st.supporter_id
     LEFT JOIN users t ON t.id=st.talent_id
     WHERE st.status='success'
       AND ($1::uuid IS NULL OR (st.created_at,st.id)<(
         SELECT created_at,id FROM live_support_transactions WHERE id=$1))
     ORDER BY st.created_at DESC,st.id DESC LIMIT 26`,[cursor])
  return {transactions:rows.slice(0,25),next_cursor:rows.length>25?rows[24].id:null,
    recorded:true}
}


const LIABILITY_AUDIT_TYPES=new Set(['escrow','wallet','pending_payout'])
const AUDIT_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

// Read-only drilldowns for financial obligations. This does not assert that
// three liability categories are additive or that the platform owns the cash.
export async function financeLiabilityAudit({kind='escrow',cursor=null}={}){
  if(!LIABILITY_AUDIT_TYPES.has(kind))
    throw Object.assign(new Error('Unknown liability audit category.'),{status:400})
  if(cursor&&!AUDIT_UUID.test(cursor))
    throw Object.assign(new Error('Invalid liability audit cursor.'),{status:400})
  const statements={
    escrow:`SELECT e.id,e.id AS source_reference, e.status,
      u.username,u.full_name,h.hat_title AS description,
      GREATEST(e.amount::bigint-COALESCE(e.start_released_amount,0)::bigint,0)::text AS amount,
      e.created_at
      FROM escrows e LEFT JOIN users u ON u.id=e.client_id
      LEFT JOIN hats h ON h.id=e.hat_id
      WHERE e.status='secured'
        AND ($1::uuid IS NULL OR (e.created_at,e.id)<(
          SELECT created_at,id FROM escrows WHERE id=$1))
      ORDER BY e.created_at DESC,e.id DESC LIMIT 26`,
    wallet:`SELECT w.user_id AS id,w.user_id AS source_reference,
      'balance'::text AS status,u.username,u.full_name,
      'Subscriber wallet liability'::text AS description,
      w.balance::bigint::text AS amount,w.updated_at AS created_at
      FROM wallets w LEFT JOIN users u ON u.id=w.user_id
      WHERE w.balance>0
        AND ($1::uuid IS NULL OR (w.updated_at,w.user_id)<(
          SELECT updated_at,user_id FROM wallets WHERE user_id=$1))
      ORDER BY w.updated_at DESC,w.user_id DESC LIMIT 26`,
    pending_payout:`SELECT wt.id,COALESCE(wt.reference,wt.id::text) AS source_reference,
      wt.status,u.username,u.full_name,
      'Pending withdrawal / payout'::text AS description,
      wt.amount::bigint::text AS amount,wt.created_at
      FROM wallet_transactions wt LEFT JOIN users u ON u.id=wt.user_id
      WHERE wt.type='withdrawal' AND wt.status='pending'
        AND ($1::uuid IS NULL OR (wt.created_at,wt.id)<(
          SELECT created_at,id FROM wallet_transactions WHERE id=$1))
      ORDER BY wt.created_at DESC,wt.id DESC LIMIT 26`,
  }
  const {rows}=await query(statements[kind],[cursor])
  return {kind,transactions:rows.slice(0,25),
    next_cursor:rows.length>25?rows[24].id:null,
    note:'Liability rows are read-only and are not platform income.'}
}
