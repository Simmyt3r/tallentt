import {query} from './db.js'

// Called only after employmentGet has authorized this exact agreement for one
// of its participants. This never reads an arbitrary user's payment history.
// A wallet record shows internal processing, not independent bank settlement.
export async function salaryPeriodStatements(agreementId,q=query){
  const {rows:installed}=await q(`SELECT
    to_regclass('salary_tracking_contributions') AS contributions,
    to_regclass('billing_charge_events') AS receipts`)
  if(!installed[0]?.contributions || !installed[0]?.receipts){
    return {available:false,byPeriod:{},note:'The dual-sided salary tracking statement migration is not installed.'}
  }
  const {rows}=await q(`SELECT p.id AS period_id,p.month,s.side,
      CASE WHEN s.side='client' THEN a.employer_id ELSE a.talent_id END AS expected_payer_id,
      c.payer_id AS contribution_payer_id,c.amount AS contribution_amount,
      c.status AS contribution_status,c.reference AS contribution_reference,
      c.paid_at,c.refunded_at AS contribution_refunded_at,
      b.id AS receipt_id,b.user_id AS receipt_payer_id,b.amount AS receipt_amount,
      b.reference AS receipt_reference,b.status AS receipt_status,
      b.created_at AS receipt_created_at,b.refunded_at AS receipt_refunded_at,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
       WHERE wt.user_id=b.user_id AND wt.reference=b.reference
         AND wt.type='billing_charge' AND wt.status='success'
         AND wt.amount=b.amount) AS matching_debits,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
       WHERE wt.user_id=b.user_id AND wt.reference='refund:'||b.reference
         AND wt.type='billing_refund' AND wt.status='success'
         AND wt.amount=b.amount) AS matching_refunds,
      (SELECT COUNT(*)::int FROM wallet_transactions wt
       WHERE wt.user_id=b.user_id AND wt.reference='refund:'||b.reference
         AND wt.type='billing_refund' AND wt.status='success') AS posted_refunds
    FROM employment_salary_periods p
    JOIN employment_agreements a ON a.id=p.agreement_id
    CROSS JOIN (VALUES ('client'::text),('talent'::text)) AS s(side)
    LEFT JOIN salary_tracking_contributions c ON c.period_id=p.id AND c.side=s.side
    LEFT JOIN billing_charge_events b ON b.source_id=p.id AND b.kind=CASE
      WHEN s.side='client' THEN 'salary_tracking' ELSE 'salary_tracking_talent' END
    WHERE p.agreement_id=$1
    ORDER BY p.month DESC,s.side`,[agreementId])
  const byPeriod={}
  for(const row of rows){
    const charged=Boolean(row.receipt_id),contributed=Boolean(row.contribution_reference)
    const consistent=charged&&contributed
      &&row.receipt_reference===row.contribution_reference
      &&row.receipt_amount===row.contribution_amount
      &&row.receipt_payer_id===row.contribution_payer_id
      &&row.receipt_payer_id===row.expected_payer_id
    let evidence='not_paid'
    if(charged!==contributed)evidence='records_disagree'
    else if(consistent){
      if(row.matching_debits!==1)evidence='charge_unverified'
      else if(row.receipt_status==='charged'&&row.contribution_status==='paid'
        &&row.posted_refunds===0)evidence='wallet_charge_recorded'
      else if(row.receipt_status==='refunded'&&row.contribution_status==='refunded'
        &&row.matching_refunds===1&&row.posted_refunds===1)evidence='wallet_refund_recorded'
      else if(row.posted_refunds>0 || row.receipt_status==='refunded'
        || row.contribution_status==='refunded')evidence='refund_review'
      else evidence='records_disagree'
    }else if(charged&&contributed)evidence='records_disagree'
    const statement={
      side:row.side,
      amount:charged?row.receipt_amount:(contributed?row.contribution_amount:null),
      status:evidence,
      receipt_id:row.receipt_id,
      reference:row.receipt_reference||row.contribution_reference||null,
      charged_at:row.receipt_created_at||row.paid_at||null,
      refunded_at:row.receipt_refunded_at||row.contribution_refunded_at||null,
      receipt_status:row.receipt_status,
      matching_debits:row.matching_debits,
      matching_refunds:row.matching_refunds,
      posted_refunds:row.posted_refunds,
    }
    ;(byPeriod[row.period_id]??=[]).push(statement)
  }
  return {
    available:true,byPeriod,
    note:'Statement amounts reflect current billing receipts for each salary month, not an invoice or independent proof of bank or cash salary payment. If a disputed month was corrected and repaid, earlier wallet journal entries may remain as historical exceptions.',
  }
}
