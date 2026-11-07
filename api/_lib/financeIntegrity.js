import {query} from './db.js'

// This is a read-only exception report, not a settlement engine.
// Wallet journal entries are internal evidence, not proof of bank settlement.
export async function financeIntegritySnapshot(){
  const {rows:tables}=await query("SELECT to_regclass('billing_charge_events') AS billing")
  if(!tables[0]?.billing)return {
    recorded:false,counts:[],sample:[],total_exceptions:0,sample_limited:false,
    gateway_settlement:{status:'unverified',records_checked:false},
    note:'Billing receipt migration is not installed. No discrepancy count can be established.',
  }

  // Both legs must match user, reference and exact amount. Orphan journals
  // can arise from older receipt changes; never correct them automatically.
  const {rows}=await query(`WITH receipt_checks AS (
    SELECT b.id,b.user_id,b.kind,b.source_id,b.amount,b.reference,b.status,b.created_at,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
       WHERE wt.user_id=b.user_id AND wt.reference=b.reference
         AND wt.type='billing_charge' AND wt.status='success'
         AND wt.amount=b.amount) AS debit_matches,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
       WHERE wt.user_id=b.user_id AND wt.reference='refund:'||b.reference
         AND wt.type='billing_refund' AND wt.status='success'
         AND wt.amount=b.amount) AS refund_matches
    FROM billing_charge_events b
  ), findings AS (
    SELECT 'charge_unverified'::text AS issue,id AS record_id,user_id,kind,
      source_id,amount,reference,status AS receipt_status,created_at AS occurred_at
      FROM receipt_checks WHERE debit_matches<>1
    UNION ALL
    SELECT 'refund_unverified',id,user_id,kind,source_id,amount,reference,status,created_at
      FROM receipt_checks WHERE status='refunded' AND refund_matches<>1
    UNION ALL
    SELECT 'unexpected_refund',id,user_id,kind,source_id,amount,reference,status,created_at
      FROM receipt_checks WHERE status='charged' AND refund_matches>0
    UNION ALL
    SELECT 'orphan_wallet_charge',wt.id,wt.user_id,'wallet_journal',NULL::uuid,
      wt.amount,wt.reference,NULL::text,wt.created_at
      FROM wallet_transactions wt
      WHERE wt.type='billing_charge' AND wt.status='success'
        AND NOT EXISTS(SELECT 1 FROM billing_charge_events b
          WHERE b.user_id=wt.user_id AND b.reference=wt.reference AND b.amount=wt.amount)
    UNION ALL
    SELECT 'orphan_wallet_refund',wt.id,wt.user_id,'wallet_journal',NULL::uuid,
      wt.amount,wt.reference,NULL::text,wt.created_at
      FROM wallet_transactions wt
      WHERE wt.type='billing_refund' AND wt.status='success'
        AND NOT EXISTS(SELECT 1 FROM billing_charge_events b
          WHERE b.user_id=wt.user_id AND wt.reference='refund:'||b.reference
            AND b.amount=wt.amount)
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('issue',issue,'count',n)
       ORDER BY issue),'[]'::jsonb) FROM
      (SELECT issue,COUNT(*)::int AS n FROM findings GROUP BY issue) totals) AS counts,
    (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY occurred_at DESC,record_id DESC,issue),
        '[]'::jsonb) FROM
      (SELECT f.*,u.username FROM findings f LEFT JOIN users u ON u.id=f.user_id
       ORDER BY f.occurred_at DESC,f.record_id DESC,f.issue LIMIT 25) x) AS sample`)

  const counts=rows[0]?.counts||[]
  const total=counts.reduce((sum,entry)=>sum+Number(entry.count||0),0)
  return {
    recorded:true,counts,sample:rows[0]?.sample||[],
    total_exceptions:total,sample_limited:total>25,
    gateway_settlement:{status:'unverified',records_checked:false},
    note:'Potential inconsistencies only. Entries are not corrected automatically. No external gateway/bank settlements, processor costs or balances have been verified. Categories may refer to the same underlying charge; do not sum them as money.',
  }
}
