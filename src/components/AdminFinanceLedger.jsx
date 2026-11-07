import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import AdminFinanceAudit from './AdminFinanceAudit.jsx'

const money=value=>{
 if(value===null||value===undefined)return 'Not recorded'
 try{return '₦'+BigInt(String(value)).toLocaleString('en-NG')}
 catch{return 'Unavailable'}
}
export default function AdminFinanceLedger(){
  const [summary,setSummary]=useState(null)
  const [stream,setStream]=useState(()=>new URLSearchParams(window.location.search).get('stream')==='live_support'?'live_support':'deal_fees')
  const [auditVersion,setAuditVersion]=useState(0)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function refresh(){
    setBusy(true);setError('')
    try{
      await api.reconcileAdminCommissions()
      setSummary(await api.getAdminFinanceSummary())
      setAuditVersion(version=>version+1)
    }
    catch(e){setError(e.message||'Finance report unavailable.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{refresh()},[])
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
      <section aria-label="Deal service charge earnings" className="rounded-2xl border border-[#0A13E6]/20 bg-[#EEF0FF] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-[14px] font-black">Deal service charges</h4>
            <p className="mt-1 text-[12px] text-black/60">Service charge earned from deals, after refund reversals.</p>
          </div>
          <button type="button" onClick={()=>setStream('deal_fees')} className="min-h-10 rounded-full border border-[#0A13E6]/30 px-4 text-[11px] font-bold text-[#0A13E6]">View service charges by deal</button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['Service charges recorded',summary.deal_commissions?.gross],
            ['Refund reversals',summary.deal_commissions?.reversed],
            ['Net service charges earned',summary.deal_commissions?.net],
          ].map(([name,value])=><div key={name} className="rounded-xl bg-white p-3">
            <p className="text-[20px] font-black tabular-nums text-[#0A13E6]">{money(value)}</p>
            <p className="mt-1 text-[11px] font-semibold text-black/60">{name}</p>
          </div>)}
        </div>
        <p className="mt-3 text-[11px] text-black/60">{summary.deal_commissions?.recorded
          ?`${summary.deal_commissions.deals} deal(s) with recorded service charge. ${summary.deal_commissions.unrecorded_deals||0} paid deal(s) have no recorded service charge; see their status below.`
          :'Service charge records are unavailable. Apply the billing migration in Database Migrations to enable recording.'}</p>
      </section>
      {stream&&<AdminFinanceAudit key={`${stream}:${auditVersion}`} stream={stream} onClose={()=>setStream(null)}/>}
      <section aria-label="Customer and escrow liabilities" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-[14px] font-black">Customer money / liabilities</h4>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            ['Outstanding secured escrow',liabilities.escrow_liability],
            ['Subscriber wallet balances',liabilities.wallet_liability],
            ['Pending payout obligations',liabilities.pending_withdrawal_liability],
          ].map(([name,value])=><div key={name} className="rounded-xl bg-white p-3">
            <p className="text-[18px] font-black tabular-nums">{money(value)}</p>
            <p className="mt-1 text-[11px] font-semibold text-black/60">{name}</p>
          </div>)}
        </div>
        <p className="mt-3 text-[11px] text-black/60">
          Escrow liability counts only the unreleased portion of currently secured deals.
          These categories must be reconciled with Paystack and bank settlement accounts before reporting total cash.
        </p>
      </section>
      <section className="rounded-2xl border border-black/15 bg-white p-4" aria-label="Platform owner revenue">
        <h4 className="text-[14px] font-black">Platform owners' income account</h4>
        <p className="mt-1 text-[12px] text-black/60">
          Platform income is separated by activity and source. Recorded charges, earned revenue and customer funds are not the same figure.
        </p>
        <div className="mt-3 divide-y divide-black/10">
          {streams.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[12px] font-bold">{item.verb&&<span className="mr-2 text-[#0A13E6]">{item.verb} ·</span>}{item.name}</p>
              <p className="text-[11px] text-black/45">{item.recorded
                ?`${item.transactions} source-linked charge(s) · ${item.source} · ${item.recognition==='earned'?'earned':'recognition pending'}`
                :'No approved fee ledger · amount unknown (not zero)'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="text-[13px] tabular-nums">{money(item.inflow)}</strong>
              {item.recorded&&['live_support','deal_fees'].includes(item.id)&&<button type="button" onClick={()=>setStream(item.id)}
                className="inline-flex min-h-10 items-center rounded-full border border-[#0A13E6]/30 px-3 text-[11px] font-bold text-[#0A13E6]">
                Audit trail
              </button>}
            </div>
          </div>)}
        </div>
        <section aria-label="Platform income totals" className="mt-4 space-y-3 bg-[#EEF0FF] p-4">
          <h5 className="text-[13px] font-black">Totals across the income streams above</h5>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold text-black/60">Total recorded platform fee charges (partial)</p>
              <p className="mt-1 text-[20px] font-black tabular-nums text-[#0A13E6]">{money(summary.income_totals?.recorded_fee_charges)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-black/60">Of which: earned platform revenue</p>
              <p className="mt-1 text-[20px] font-black tabular-nums">{money(summary.income_totals?.earned_revenue ?? summary.recognized_revenue)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-black/60">Charges pending revenue recognition</p>
              <p className="mt-1 text-[20px] font-black tabular-nums">{money(summary.income_totals?.pending_recognition)}</p>
            </div>
          </div>
          <p className="text-[11px] text-black/55">Partial totals from recorded platform fee events only; not verified bank settlement or net profit. Missing fee sources cannot be presumed to be ₦0.</p>
        </section>
        <p className="mt-3 text-[11px] text-amber-800">{summary.warning}</p>
      </section>
    </>}
  </div>
}
