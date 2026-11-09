import {summarizeRecordedIncome} from '../../shared/incomeTotals.js'
import {query} from './db.js'

// Financial reporting treats only source-linked platform fees as income.
// A charge can exist before the service has been earned or the bank has settled it.

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
      COUNT(*)::int AS transactions,COUNT(DISTINCT escrow_id)::int AS deals,
      (SELECT COUNT(*)::int FROM escrows e WHERE e.status IN ('secured','released','refunded')
        AND NOT EXISTS(SELECT 1 FROM gig_fee_events f WHERE f.escrow_id=e.id)) AS unrecorded_deals
      FROM gig_fee_events`)
    gig=rows[0]
    if(tables[0]?.gig_adjustments){
      const {rows:adjustments}=await query(`SELECT COALESCE(SUM(commission_reversed::bigint),0)::text AS reversals FROM gig_commission_adjustments`)
      gig={...gig,accrued_fees:(BigInt(gig.accrued_fees||0)-BigInt(adjustments[0]?.reversals||0)).toString(),
        commission_reversals:adjustments[0]?.reversals||'0'}
    }
  }
  if(tables[0]?.billing_fees){
    // Only call a charge *recorded* when exactly one successful matching
    // wallet debit exists. A missing/double debit is an Admin exception,
    // not provable platform income. Refunded charges are excluded here.
    const {rows}=await query(`WITH verified AS (
      SELECT b.kind,b.amount,b.status,
        (SELECT COUNT(*)::int FROM wallet_transactions wt
          WHERE wt.user_id=b.user_id AND wt.reference=b.reference
            AND wt.type='billing_charge' AND wt.status='success'
            AND wt.amount=b.amount) AS debits,
        (SELECT COUNT(*)::int FROM wallet_transactions wt
          WHERE wt.user_id=b.user_id AND wt.reference='refund:'||b.reference
            AND wt.type='billing_refund' AND wt.status='success') AS posted_refunds
      FROM billing_charge_events b
    ) SELECT kind,
      COALESCE(SUM(amount::bigint) FILTER(WHERE status='charged' AND debits=1 AND posted_refunds=0),0)::text AS charged_fees,
      COUNT(*) FILTER(WHERE status='charged' AND debits=1 AND posted_refunds=0)::int AS transactions,
      COUNT(*) FILTER(WHERE status='charged' AND (debits<>1 OR posted_refunds>0))::int AS unmatched_charges
      FROM verified GROUP BY kind`)
    billing=rows
  }
  const billingStream=(kind,name,verb)=>(()=>{
    const row=billing?.find(item=>item.kind===kind)
    return {id:kind,name,verb,source:'billing_charge_events',recognition:'pending',
      recorded:billing!==null,
      inflow:billing!==null?(row?.charged_fees||'0'):null,
      transactions:billing!==null?(row?.transactions||0):null,
      unmatched_charges:billing!==null?(row?.unmatched_charges||0):null}
  })()
  const incomeStreams=[
    {id:'live_support',name:'Live support platform fees',verb:'Live',recognition:'earned',
      source:'live_support_transactions',recorded:exists,
      inflow:live?.accrued_fees??null,transactions:live?.transactions??null},
    {id:'deal_fees',name:'Deal service charges (net of refunds)',verb:'Book',recognition:'earned',
      source:'gig_fee_events',recorded:gig!==null,
      inflow:gig?.accrued_fees??null,transactions:gig?.transactions??null},
    billingStream('salary_tracking','Client salary tracking charges','Hire'),
    billingStream('salary_tracking_talent','Talent salary tracking charges','Hire'),
    billingStream('business_verification','Business verification review fees','Verification'),
    billingStream('subscription','Subscription collections','Subscription'),
    {id:'collab_fees',name:'Collaboration Seal platform fees',verb:'Collab',recognition:'pending',
      source:'no approved fee-event ledger',recorded:false,inflow:null,transactions:null},
    {id:'hire_fees',name:'Hire Seal platform fees (excluding tracking)',verb:'Hire',recognition:'pending',
      source:'no approved fee-event ledger',recorded:false,inflow:null,transactions:null},
    {id:'sponsor_fees',name:'Sponsor Seal platform fees (not sponsor-to-Talent payments)',verb:'Sponsor',recognition:'pending',
      source:'no approved fee-event ledger',recorded:false,inflow:null,transactions:null},
    {id:'advertising',name:'Investor advertising (awaiting verified earned ledger)',verb:'Advertise',recognition:'pending',
      source:'ad_accounting_entries (not yet integrated)',recorded:false,inflow:null,transactions:null},
    {id:'other_income',name:'Other platform income',verb:'Other',recognition:'pending',
      source:'no approved fee-event ledger',recorded:false,inflow:null,transactions:null},
  ]
  const incomeTotals=summarizeRecordedIncome(incomeStreams)
  return {
    currency:'NGN',
    liabilities:liability[0],
    income_streams:incomeStreams,
    income_totals:incomeTotals,
    deal_commissions:{recorded:gig!==null,
      gross:gig!==null?(BigInt(gig.accrued_fees||0)+BigInt(gig.commission_reversals||0)).toString():null,
      reversed:gig!==null?(gig.commission_reversals||'0'):null,
      net:gig?.accrued_fees??null,deals:gig?.deals??null,unrecorded_deals:gig?.unrecorded_deals??null},
    recognized_revenue:incomeTotals.earned_revenue,
    recognized_revenue_partial:true,
    net_profit:null,
    warning:'Only charges with one matching successful wallet debit are counted in billing collections. Unmatched charges and receipts refunded in the wallet but still marked charged require Admin review; they are excluded from collection totals. Recorded charges are partial, not bank-settled cash or net profit. Earned revenue currently includes source-linked live support fees and deal service charges after reversals. Subscription, salary tracking and verification await recognition/refund policy. Collab, Hire Seal and Sponsor Seal platform fees lack an approved event ledger; amounts are unknown, not zero. Investor advertising is separately listed as unavailable until provider-funded campaign earning and settlement verification are implemented; campaign deposits must never be counted as platform earnings. Escrow, sponsor-to-Talent funds, wallet deposits and payouts are never platform earnings. Taxes and processor costs are not reconciled.',
  }
}
export async function financeAudit({stream='live_support',cursor=null}={}){
  if(stream==='deal_fees')return dealCommissionAudit({cursor})
  if(BILLING_AUDIT_KINDS.has(stream))return billingChargeAudit({kind:stream,cursor})
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


const BILLING_AUDIT_KINDS=new Set([
  'salary_tracking','salary_tracking_talent','business_verification','subscription',
])

// Read-only source reconciliation; never treats a charged row alone as
// proof of collection, and never conflates wallet debits with bank cash.
async function billingChargeAudit({kind,cursor=null}={}){
  if(!BILLING_AUDIT_KINDS.has(kind))
    throw Object.assign(new Error('Invalid billing category.'),{status:400})
  if(cursor&&!AUDIT_UUID.test(cursor))
    throw Object.assign(new Error('Invalid audit cursor.'),{status:400})
  const {rows:found}=await query("SELECT to_regclass('billing_charge_events') AS present")
  if(!found[0]?.present)return {transactions:[],next_cursor:null,recorded:false}
  const {rows}=await query(`SELECT b.id,b.user_id,b.kind,b.source_id,b.amount,b.status,
      b.reference,b.created_at,b.refunded_at,u.username,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
        WHERE wt.user_id=b.user_id AND wt.reference=b.reference
          AND wt.type='billing_charge' AND wt.status='success'
          AND wt.amount=b.amount) AS matching_debits,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
        WHERE wt.user_id=b.user_id AND wt.reference=('refund:'||b.reference)
          AND wt.type='billing_refund' AND wt.status='success'
          AND wt.amount=b.amount) AS matching_refunds,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
        WHERE wt.user_id=b.user_id AND wt.reference=('refund:'||b.reference)
          AND wt.type='billing_refund' AND wt.status='success') AS posted_refunds
    FROM billing_charge_events b LEFT JOIN users u ON u.id=b.user_id
    WHERE b.kind=$1
      AND ($2::uuid IS NULL OR (b.created_at,b.id)<(
        SELECT created_at,id FROM billing_charge_events WHERE id=$2 AND kind=$1))
    ORDER BY b.created_at DESC,b.id DESC LIMIT 26`,[kind,cursor])
  const transactions=rows.slice(0,25).map(row=>({
    ...row,
    wallet_evidence:row.matching_debits===1
      ? (row.status==='refunded'
        ? (row.matching_refunds===1?'refunded_verified':'refund_unverified')
        : (row.posted_refunds>0?'unexpected_refund':'charged_verified'))
      : 'charge_unverified',
  }))
  return {transactions,next_cursor:rows.length>25?rows[24].id:null,recorded:true}
}

const LIABILITY_AUDIT_TYPES=new Set(['escrow','wallet','pending_payout'])
const AUDIT_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i


// One row per deal: aggregate milestones before joining refund adjustments so
// a reversal is deducted exactly once, even on legacy multi-release deals.
async function dealCommissionAudit({cursor=null}={}){
  if(cursor&&!AUDIT_UUID.test(cursor))
    throw Object.assign(new Error('Invalid audit cursor.'),{status:400})
  const {rows:tables}=await query("SELECT to_regclass('gig_fee_events') AS fees, to_regclass('gig_commission_adjustments') AS adjustments")
  if(!tables[0]?.fees)return {transactions:[],next_cursor:null,recorded:false}
  const hasAdjustments=Boolean(tables[0]?.adjustments)
  const {rows}=await query(`WITH commissions AS (
    SELECT f.escrow_id,SUM(f.fee_amount::bigint) AS commission_gross,
      MAX(f.created_at) AS last_charge_at,
      jsonb_agg(jsonb_build_object('id',f.id,'stage',f.stage,
        'gross_amount',f.gross_released::text,'fee_amount',f.fee_amount::text,
        'rate_bps',f.rate_bps,'created_at',f.created_at,
        'source_transaction_id',to_jsonb(f)->>'source_transaction_id',
        'origin',to_jsonb(f)->>'origin',
        'reconciled_at',to_jsonb(f)->>'reconciled_at')
        ORDER BY f.created_at,f.id) AS events
    FROM gig_fee_events f GROUP BY f.escrow_id
  ), deals AS (
    SELECT e.id,e.amount::text AS deal_amount,e.currency,e.status,e.work_status,
      e.client_id,e.talent_id,h.hat_title AS deal_title,
      c.username AS client_username,t.username AS talent_username,
      COALESCE(f.commission_gross,0)::text AS commission_gross,
      CASE WHEN f.escrow_id IS NOT NULL THEN 'recorded'
        WHEN COALESCE((to_jsonb(e)->>'gig_fee_bps')::int,0)>0 THEN 'unverified'
        ELSE 'not_collected' END AS commission_status,
      ${hasAdjustments?'COALESCE(a.commission_reversed,0)':'0'}::text AS commission_reversed,
      (COALESCE(f.commission_gross,0)-${hasAdjustments?'COALESCE(a.commission_reversed,0)':'0'})::text AS commission_net,
      ${hasAdjustments?'COALESCE(a.refunded_gross,0)':'0'}::text AS refunded_gross,
      ${hasAdjustments?'a.created_at':'NULL::timestamptz'} AS reversed_at,
      ${hasAdjustments?'GREATEST(COALESCE(f.last_charge_at,e.funded_at,e.released_at,e.created_at),a.created_at)':'COALESCE(f.last_charge_at,e.funded_at,e.released_at,e.created_at)'} AS created_at,
      COALESCE(f.events,'[]'::jsonb) AS events,
      ${hasAdjustments?"to_jsonb(a)->>'source_transaction_id'":'NULL::text'} AS refund_transaction_id
    FROM escrows e LEFT JOIN commissions f ON e.id=f.escrow_id
    LEFT JOIN hats h ON h.id=e.hat_id
    LEFT JOIN users c ON c.id=e.client_id
    LEFT JOIN users t ON t.id=e.talent_id
    ${hasAdjustments?'LEFT JOIN gig_commission_adjustments a ON a.escrow_id=e.id':''}
    WHERE e.status IN ('secured','released','refunded') OR f.escrow_id IS NOT NULL
  ) SELECT * FROM deals
    WHERE ($1::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM deals WHERE id=$1))
    ORDER BY created_at DESC,id DESC LIMIT 26`,[cursor])
  return {transactions:rows.slice(0,25),next_cursor:rows.length>25?rows[24].id:null,recorded:true}
}

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
