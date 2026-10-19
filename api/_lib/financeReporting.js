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
    query("SELECT to_regclass('live_support_transactions') AS live_support"),
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
  return {
    currency:'NGN',
    liabilities:liability[0],
    income_streams:[
      {id:'live_support',name:'Live support platform fees',source:'live_support_transactions',
        recorded:exists,inflow:live?.accrued_fees??null,transactions:live?.transactions??null},
      {id:'deal_fees',name:'Deal commissions',source:'no immutable fee accrual ledger yet',
        recorded:false,inflow:null,transactions:null},
      {id:'sponsorships',name:'Sponsorship and other income',source:'not reconciled in this release',
        recorded:false,inflow:null,transactions:null},
    ],
    recognized_revenue:live?.accrued_fees??null,
    recognized_revenue_partial:true,
    net_profit:null,
    warning:'Recognized revenue covers verified Live support fees only. This is not net profit or withdrawable cash. No verified cost, tax, settlement or cash reconciliation ledger exists for all streams.',
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
