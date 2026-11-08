import {query} from './db.js'
import {verifyPaystackTransaction} from './paystack.js'

const fail=(message,status=400)=>Object.assign(new Error(message),{status})
// Legacy booking checkouts used underscores, whereas newer Paystack references
// usually contain only alphanumerics, dash, dot or equals.
const REFERENCE=/^[A-Za-z0-9_.=-]{8,160}$/
const note='Provider verification and wallet ledger matching are not proof that the Paystack balance settled into the company bank account.'

// Read-only, one explicit reference at a time. The caller must already have
// authenticated Admin rights. Never use this to issue credits or refunds.
export async function financePaystackReferenceReview(reference,{q=query,verify=verifyPaystackTransaction}={}){
  const clean=typeof reference==='string'?reference.trim():''
  if(!REFERENCE.test(clean))throw fail('Enter a valid Paystack reference (8–160 permitted characters).')
  const txn=await verify(clean)
  if(!txn||txn.reference!==clean)throw fail('Provider verification reference did not match.',409)
  const mode=txn.metadata?.wallet_topup===true||txn.metadata?.wallet_topup==='true'
    ?'wallet_topup':txn.metadata?.escrow_id?'legacy_booking':'unknown'
  const providerValid=txn.status==='success'&&txn.currency==='NGN'
    &&Number.isSafeInteger(txn.amount)&&txn.amount>=100
  const intended=txn.metadata?.intended_amount
  const intendedNumber=Number(intended)
  const hasIntent=intended!==undefined&&intended!==null&&intended!==''
  const requested=mode==='wallet_topup'&&hasIntent?intendedNumber:Math.floor(Number(txn.amount)/100)
  const requestedValid=Number.isSafeInteger(requested)&&requested>=1
    &&requested<=2147483647
  const amountValid=providerValid&&requestedValid&&txn.amount>=requested*100
  const [walletResult,escrowResult]=await Promise.all([
    q(`SELECT wt.id,wt.user_id,wt.type,wt.status,wt.amount,wt.reference,wt.created_at,
        u.username
       FROM wallet_transactions wt LEFT JOIN users u ON u.id=wt.user_id
       WHERE wt.reference=$1 OR wt.reference=$2 ORDER BY wt.created_at DESC,wt.id DESC`,
      [clean,'paystack:'+clean]),
    q('SELECT id,client_id,status,amount FROM escrows WHERE payment_reference=$1',[clean]),
  ])
  const walletRows=walletResult.rows
  const escrowRows=escrowResult.rows
  const ledger=walletRows[0]||null
  const sourceEscrow=escrowRows[0]||null
  const expectedReference=mode==='legacy_booking'?'paystack:'+clean:clean
  const expectedPayer=mode==='wallet_topup'?String(txn.metadata?.user_id||'')
    :sourceEscrow?String(sourceEscrow.client_id):''
  const sourceMatches=mode==='wallet_topup'?Boolean(expectedPayer)
    :mode==='legacy_booking'&&Boolean(sourceEscrow)
      &&String(txn.metadata.escrow_id)===String(sourceEscrow.id)
  let code='matched'
  if(!providerValid)code='provider_not_successful'
  else if(!amountValid)code='invalid_provider_amount'
  else if(mode==='unknown')code='unclassified_provider_payment'
  else if(!sourceMatches)code='payment_source_mismatch'
  else if(walletRows.length===0)code='verified_payment_missing_wallet_posting'
  else if(walletRows.length>1)code='duplicate_or_conflicting_wallet_postings'
  else if(ledger.reference!==expectedReference||ledger.type!=='topup'
    ||ledger.status!=='success'||String(ledger.user_id)!==expectedPayer
    ||Number(ledger.amount)!==(mode==='legacy_booking'?Math.floor(txn.amount/100):requested))
    code='wallet_provider_mismatch'
  return {
    reference:clean,checked_at:new Date().toISOString(),mode,
    provider:{status:txn.status||'unknown',currency:txn.currency||null,
      amount_kobo:Number.isSafeInteger(txn.amount)?txn.amount:null,
      intended_naira:requestedValid?requested:null},
    wallet_postings:walletRows.map(row=>({
      id:row.id,reference:row.reference,username:row.username||null,
      type:row.type,status:row.status,amount_naira:Number(row.amount),
      created_at:row.created_at,
    })),
    linked_escrow:sourceEscrow?{id:sourceEscrow.id,status:sourceEscrow.status}:null,
    assessment:{code,matched:code==='matched'},
    bank_settlement:{status:'unverified',records_checked:false},
    note,
  }
}
