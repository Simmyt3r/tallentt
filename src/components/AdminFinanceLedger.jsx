import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

const money=value=>{
 if(value===null||value===undefined)return 'Not recorded'
 try{return '₦'+BigInt(String(value)).toLocaleString('en-NG')}
 catch{return 'Unavailable'}
}
export default function AdminFinanceLedger(){
  const [summary,setSummary]=useState(null)
  const [rows,setRows]=useState([])
  const [cursor,setCursor]=useState(null)
  const [stream,setStream]=useState(null)
  const [liabilityKind,setLiabilityKind]=useState(null)
  const [liabilityRows,setLiabilityRows]=useState([])
  const [liabilityCursor,setLiabilityCursor]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function refresh(){
    setBusy(true);setError('')
    try{setSummary(await api.getAdminFinanceSummary())}
    catch(e){setError(e.message||'Finance report unavailable.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{refresh()},[])
  useEffect(()=>{
    const selected=new URLSearchParams(window.location.search).get('stream')
    if(selected==='live_support')openAudit(selected)
  },[])
  async function openAudit(id,next=null){
    setBusy(true);setError('')
    try{
      const data=await api.getAdminFinanceAudit(id,next)
      setRows(current=>next?[...current,...data.transactions]:data.transactions)
      setStream(id);setCursor(data.next_cursor)
    }catch(e){setError(e.message||'Could not load accrual audit.')}
    finally{setBusy(false)}
  }
  async function openLiability(kind,next=null){
    setBusy(true);setError('')
    try{
      const data=await api.getAdminLiabilityAudit(kind,next)
      setLiabilityRows(current=>next?[...current,...data.transactions]:data.transactions)
      setLiabilityCursor(data.next_cursor)
      setLiabilityKind(kind)
      setStream(null)
    }catch(err){setError(err.message||'Could not load liability records.')}
    finally{setBusy(false)}
  }
  const liabilityLabels={
    escrow:'Outstanding secured escrow',
    wallet:'Subscriber wallet balances',
    pending_payout:'Pending payout obligations',
  }
  const liabilities=summary?.liabilities||{}
  const streams=summary?.income_streams||[]
  return <div className="space-y-4 p-4" aria-label="Escrow liability and platform earnings">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-[16px] font-black">Escrow liability & platform earnings</h3>
        <p className="text-[12px] text-black/55">Customer balances are never company income. Fees are shown separately from liabilities.</p>
      </div>
      <button type="button" onClick={refresh} disabled={busy} className="min-h-10 rounded-full border border-black/20 px-4 text-[11px] font-bold">Refresh</button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    {!summary&&busy&&<p role="status" className="text-sm">Loading accounting records…</p>}
    {summary&&<>
      <section aria-label="Customer and escrow liabilities" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-[14px] font-black">Customer money / liabilities</h4>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            ['escrow',liabilities.escrow_liability],
            ['wallet',liabilities.wallet_liability],
            ['pending_payout',liabilities.pending_withdrawal_liability],
          ].map(([kind,value])=><div key={kind} className="rounded-xl bg-white p-3">
            <p className="text-[18px] font-black tabular-nums">{money(value)}</p>
            <p className="mt-1 text-[11px] font-semibold text-black/60">{liabilityLabels[kind]}</p>
            <button type="button" onClick={()=>openLiability(kind)} disabled={busy}
              className="mt-2 min-h-9 rounded-full border border-black/20 px-3 text-[11px] font-bold text-[#0A13E6] disabled:opacity-40">
              View liability audit
            </button>
          </div>)}
        </div>
        <p className="mt-3 text-[11px] text-black/60">
          Escrow liability counts only the unreleased portion of currently secured deals.
          These categories must be reconciled with Paystack and bank settlement accounts before reporting total cash.
        </p>
      </section>
      {liabilityKind&&<section className="rounded-2xl border border-black/15 bg-white p-4" aria-label="Customer liability audit trail">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="text-[14px] font-black">{liabilityLabels[liabilityKind]} · audit trail</h4>
            <p className="mt-1 text-[11px] text-black/55">Read-only outstanding obligations. Not platform revenue or net profit.</p></div>
          <button type="button" onClick={()=>setLiabilityKind(null)} className="min-h-10 rounded-full border border-black/20 px-3 text-[11px]">Close audit</button>
        </div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[11px]">
          <thead><tr className="border-b border-black/15"><th className="p-2">Recorded/updated</th>
            <th className="p-2">Source reference</th><th className="p-2">Subscriber</th>
            <th className="p-2">Outstanding</th><th className="p-2">Status</th></tr></thead>
          <tbody>{liabilityRows.map(item=><tr key={item.id} className="border-b border-black/10">
            <td className="p-2">{new Date(item.created_at).toLocaleString('en-NG')}</td>
            <td className="max-w-48 break-all p-2 font-mono">{item.source_reference}</td>
            <td className="p-2">{item.username||item.full_name||'Deleted account'}<span className="block text-black/50">{item.description||''}</span></td>
            <td className="p-2 font-bold">{money(item.amount)}</td><td className="p-2">{item.status}</td>
          </tr>)}</tbody></table>
          {!liabilityRows.length&&<p className="p-3 text-[12px] text-black/50">No outstanding records in this category.</p>}
        </div>
        {liabilityCursor&&<button type="button" disabled={busy} onClick={()=>openLiability(liabilityKind,liabilityCursor)}
          className="mt-3 min-h-10 rounded-full border border-black/20 px-4 text-[12px] font-bold">Load older records</button>}
      </section>}
      <section className="rounded-2xl border border-black/15 bg-white p-4" aria-label="Platform owner revenue">
        <h4 className="text-[14px] font-black">Platform owners' income account</h4>
        <p className="mt-1 text-[12px] text-black/60">
          Recognized, traceable income streams only. No deposits, escrow holdings, wallet top-ups, or user payouts are treated as profit.
        </p>
        <div className="mt-4 rounded-xl bg-[#EEF0FF] p-4">
          <p className="text-[11px] font-bold text-black/60">Auditable recorded platform fee inflows (partial)</p>
          <p className="text-[25px] font-black text-[#0A13E6]">{money(summary.recognized_revenue)}</p>
          <p className="mt-1 text-[11px] text-black/60">
            Net profit: <strong>Not established</strong>. Costs, refunds, taxes and settlement are not yet reconciled.
          </p>
        </div>
        <div className="mt-3 divide-y divide-black/10">
          {streams.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[12px] font-bold">{item.name}</p>
              <p className="text-[11px] text-black/45">{item.recorded
                ?`${item.transactions} verifiable accrual(s) · ${item.source}`
                :'No approved accrual source yet · not treated as zero revenue'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="text-[13px] tabular-nums">{money(item.inflow)}</strong>
              {item.recorded&&<a href={`/admin?tab=finance&stream=${encodeURIComponent(item.id)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-[#0A13E6]/30 px-3 text-[11px] font-bold text-[#0A13E6]">
                Audit trail
              </a>}
            </div>
          </div>)}
        </div>
        <p className="mt-3 text-[11px] text-amber-800">{summary.warning}</p>
      </section>
      {stream&&<section className="rounded-2xl border border-black/15 bg-white p-4" aria-label="Platform fee accrual audit">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[14px] font-black">Live support fee audit trail</h4>
          <button type="button" onClick={()=>setStream(null)} className="rounded-full border border-black/20 px-3 py-2 text-[11px]">Close audit</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[11px]">
            <thead><tr className="border-b border-black/15">
              <th className="p-2">Recorded</th><th className="p-2">Source reference</th>
              <th className="p-2">Supporter / Talent</th><th className="p-2">Gross</th>
              <th className="p-2">Platform fee</th><th className="p-2">Talent net</th>
            </tr></thead>
            <tbody>{rows.map(item=><tr key={item.id} className="border-b border-black/10">
              <td className="p-2">{new Date(item.created_at).toLocaleString('en-NG')}</td>
              <td className="max-w-36 break-all p-2 font-mono">{item.id}</td>
              <td className="p-2">{item.supporter_username||'Deleted account'} / {item.talent_username||'Deleted account'}</td>
              <td className="p-2">{money(item.gross_amount)}</td>
              <td className="p-2 font-bold">{money(item.platform_fee)}</td>
              <td className="p-2">{money(item.net_amount)}</td>
            </tr>)}</tbody>
          </table>
          {!rows.length&&<p className="p-3 text-[12px] text-black/50">No posted, successful accruals found.</p>}
        </div>
        {cursor&&<button type="button" disabled={busy} onClick={()=>openAudit(stream,cursor)}
          className="mt-3 rounded-full border border-black/20 px-4 py-2 text-[12px] font-bold">Load older accruals</button>}
      </section>}
    </>}
  </div>
}
