import {useState} from 'react'
import {api} from '../lib/api.js'

const issueNames={
  charge_unverified:'Charge has no exact matching wallet debit',
  refund_unverified:'Refunded receipt has no exact matching wallet credit',
  unexpected_refund:'Wallet refund exists but receipt remains charged',
  orphan_wallet_charge:'Wallet charge has no matching billing receipt',
  orphan_wallet_refund:'Wallet refund has no matching billing receipt',
}
const money=value=>{
  try{return '₦'+BigInt(String(value)).toLocaleString('en-NG')}
  catch{return 'Unknown'}
}

export default function AdminFinanceIntegrity(){
  const [report,setReport]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function inspect(){
    if(busy)return
    setBusy(true);setError('')
    try{setReport(await api.getAdminFinanceIntegrity())}
    catch(e){setError(e.message||'Finance integrity check could not be completed.')}
    finally{setBusy(false)}
  }
  return <section aria-label="Finance integrity checks" className="rounded-2xl border border-black/15 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="text-[14px] font-black">Finance integrity checks</h4>
        <p className="mt-1 text-[12px] text-black/60">Find unmatched wallet debits, refunds and billing records without changing balances.</p>
      </div>
      <button type="button" onClick={inspect} disabled={busy}
        className="min-h-10 rounded-full border border-black/20 px-4 text-[11px] font-bold disabled:opacity-50">
        {busy?'Checking…':report?'Run check again':'Run read-only check'}
      </button>
    </div>
    {error&&<p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p>}
    {report&&<div className="mt-3 space-y-3">
      {!report.recorded
        ?<p role="status" className="text-[12px] text-amber-800">Billing migration is not installed. Exceptions cannot be counted until its records are available.</p>
        :<>
          <p role="status" className="text-[12px] font-semibold">
            {report.total_exceptions===0
              ?'No discrepancies found in the recorded billing/wallet pairs.'
              :report.total_exceptions+' potential billing-journal issue(s) require review.'}
          </p>
          {report.counts.length>0&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.counts.map(entry=><div key={entry.issue} className="rounded-xl bg-amber-50 p-3">
              <p className="text-[20px] font-black tabular-nums">{entry.count}</p>
              <p className="text-[11px] text-black/70">{issueNames[entry.issue]||entry.issue}</p>
            </div>)}
          </div>}
          {report.sample.length>0&&<div className="overflow-x-auto">
            <table className="w-full min-w-[730px] text-left text-[11px]">
              <caption className="sr-only">Source-linked billing and wallet journal exceptions for Admin review</caption>
              <thead><tr className="border-b border-black/10">
                {['Issue','Subscriber','Category','Amount','Reference','Recorded'].map(label=>
                  <th scope="col" key={label} className="p-2">{label}</th>)}
              </tr></thead>
              <tbody>{report.sample.map((item,i)=><tr key={item.issue+':'+item.record_id+':'+i}
                className="border-b border-black/10 align-top">
                <td className="p-2 font-semibold text-amber-800">{issueNames[item.issue]||item.issue}</td>
                <td className="p-2">{item.username||'Account unavailable'}</td>
                <td className="p-2">{String(item.kind||'').replace(/_/g,' ')}</td>
                <td className="p-2 font-semibold tabular-nums">{money(item.amount)}</td>
                <td className="max-w-52 break-all p-2 font-mono">
                  {item.reference||'No reference'}
                  <p className="mt-1 text-black/45">{item.record_id}</p>
                </td>
                <td className="p-2">{item.occurred_at?new Date(item.occurred_at).toLocaleDateString('en-NG'):'Unknown'}</td>
              </tr>)}</tbody>
            </table>
            {report.sample_limited&&<p className="mt-2 text-[11px] text-black/55">Showing only the 25 most recent issue records; category counts cover all recorded findings.</p>}
          </div>}
        </>}
      <p className="text-[11px] text-amber-800">Bank / Paystack settlement: <strong>not verified</strong>. Wallet journal entries do not prove external settlement.</p>
      <p className="text-[11px] text-black/55">{report.note}</p>
    </div>}
  </section>
}
