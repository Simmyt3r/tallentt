import {useState} from 'react'
import {api} from '../lib/api.js'

const findings={
  matched:'Verified Paystack transaction matches one successful wallet credit.',
  provider_not_successful:'Paystack did not verify a successful NGN transaction.',
  invalid_provider_amount:'Provider amount or disclosed requested top-up is inconsistent.',
  unclassified_provider_payment:'Payment does not identify a supported ChombuTar wallet or legacy booking.',
  payment_source_mismatch:'The wallet owner or linked deal does not match the verified payment.',
  verified_payment_missing_wallet_posting:'Paystack verified success, but no wallet credit was recorded under this reference.',
  duplicate_or_conflicting_wallet_postings:'Multiple wallet records use this provider reference family.',
  wallet_provider_mismatch:'The recorded wallet entry differs from the verified owner, amount, status or reference.',
}
const naira=value=>{
  if(value===null||value===undefined)return 'Unavailable'
  return '₦'+Number(value).toLocaleString('en-NG',{minimumFractionDigits:0,maximumFractionDigits:2})
}

export default function AdminPaystackReferenceReview(){
  const [reference,setReference]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [result,setResult]=useState(null)
  async function check(e){
    e.preventDefault()
    if(busy)return
    setBusy(true);setError('');setResult(null)
    try{setResult(await api.reviewAdminPaystackReference(reference.trim()))}
    catch(err){setError(err.message||'Could not verify this Paystack reference.')}
    finally{setBusy(false)}
  }
  return <section aria-label="Paystack reference review" className="space-y-3 border-t border-black/10 py-4">
    <div>
      <h4 className="text-[14px] font-black">Paystack reference review</h4>
      <p className="mt-1 text-[12px] text-black/60">Check one payment against Paystack and the internal wallet journal. The check never credits or debits a wallet.</p>
    </div>
    <form onSubmit={check} className="flex flex-wrap items-end gap-2">
      <label className="min-w-[190px] flex-1 space-y-1 text-[12px] font-semibold">
        <span>Transaction reference</span>
        <input aria-label="Paystack transaction reference" className="tw-input w-full" value={reference}
          onChange={e=>{setReference(e.target.value);setResult(null)}} required
          minLength={8} maxLength={160} pattern="[A-Za-z0-9_.=-]{8,160}"
          autoCapitalize="none" spellCheck={false} autoComplete="off"
          placeholder="Paste Paystack reference"/>
      </label>
      <button type="submit" disabled={busy} className="min-h-10 rounded-full border border-black/20 px-4 text-[11px] font-bold disabled:opacity-50">
        {busy?'Verifying…':'Check reference — read only'}
      </button>
    </form>
    {error&&<p role="alert" className="text-[12px] text-red-700">{error}</p>}
    {result&&<div role="status" className="space-y-2 text-[12px]">
      <p className={result.assessment?.matched?'font-bold text-green-700':'font-bold text-amber-800'}>
        {findings[result.assessment?.code]||'Reference requires Finance review.'}
      </p>
      <p className="break-all font-mono text-[11px]">{result.reference}</p>
      <p>Provider: {result.provider?.status||'unknown'} · {result.provider?.currency||'Unknown currency'}
        · {result.provider?.amount_kobo==null?'Amount unavailable':naira(result.provider.amount_kobo/100)}</p>
      <p>Payment source: {String(result.mode||'unknown').replaceAll('_',' ')}</p>
      {result.wallet_postings?.length
        ?<ul className="space-y-2">{result.wallet_postings.map(item=><li key={item.id} className="border-t border-black/10 pt-2">
          <p>{item.username||'Unknown subscriber'} · {naira(item.amount_naira)} · {item.type} · {item.status}</p>
          <p className="break-all font-mono text-[11px] text-black/55">{item.reference}</p>
        </li>)}</ul>
        :<p className="text-amber-800">No matching wallet journal posting found.</p>}
      {result.linked_escrow&&<p className="break-all text-[11px]">Linked booking: {result.linked_escrow.id} · {result.linked_escrow.status}</p>}
      <p className="text-[11px] text-amber-800">Bank settlement: <strong>not verified</strong>. This checks provider transaction status, not money arriving in a bank account.</p>
      <p className="text-[11px] text-black/55">{result.note}</p>
    </div>}
  </section>
}
