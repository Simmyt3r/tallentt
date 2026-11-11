import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

// Admin-only read report. Never offers a button to activate, fund or settle an ad.
export default function AdminAdPilotReadiness(){
  const [report,setReport]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  async function refresh(){
    setLoading(true);setError('')
    try{setReport(await api.getAdPilotReadiness())}
    catch(e){setError(e.message||'Pilot readiness is currently unavailable.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{let active=true;api.getAdPilotReadiness()
    .then(data=>{if(active)setReport(data)})
    .catch(e=>{if(active)setError(e.message||'Pilot readiness is currently unavailable.')})
    .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}},[])
  const names={
    approved_advertisers:'Approved advertisers',
    pending_advertisers:'Pending advertisers',
    campaigns_under_review:'Campaigns under editorial review',
    editorially_approved_campaigns:'Editorially approved campaigns',
    internally_active_campaign_records:'Records marked active (not verified live)',
    approved_creatives:'Approved creatives',
    pending_creatives:'Pending creatives',
    accepted_price_records:'Internally accepted pricing records',
    internally_marked_funding_receipts:'Internally marked funding receipts — not bank verified',
    internally_marked_billable_events:'Internally marked delivery events — not audited',
    internally_active_placements:'Placements marked active (not verified live)',
    detached_placements:'Detached placements',
    accepted_talent_policy_records:'Current Talent policy acceptances',
    test_simulations:'Simulated settlement snapshots',
  }
  return <section aria-label="Advertising pilot readiness" className="space-y-3 rounded-2xl border border-[#0A13E6]/20 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-[15px] font-black">Pilot readiness</h3>
        <p className="text-xs text-black/60">Read-only assessment · no live charging or payouts</p></div>
      <button type="button" onClick={refresh} disabled={loading}
        className="min-h-10 rounded-full border border-black/20 px-4 text-xs font-bold disabled:opacity-50">
        {loading?'Checking…':'Recheck'}
      </button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {report&&<>
      <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
        Paid advertising, commercial campaign activation and payouts are BLOCKED. Internal database statuses are not verified bank or delivery evidence.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-[#F7F3EB] p-3">
          <p className="text-lg font-black">{report.schema.installed}/{report.schema.total}</p>
          <p className="text-[11px] text-black/60">Required tables available</p>
        </div>
        <div className="rounded-xl bg-[#F7F3EB] p-3">
          <p className="text-lg font-black">{report.blockers.length}</p>
          <p className="text-[11px] text-black/60">Outstanding launch blockers</p>
        </div>
        <div className="rounded-xl bg-[#F7F3EB] p-3">
          <p className="text-lg font-black">{report.environment.is_preview?'Preview':'Not preview'}</p>
          <p className="text-[11px] text-black/60">Deployment mode</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(report.data_counts).map(([key,value])=><div key={key} className="flex justify-between gap-3 border-b border-black/10 py-2">
          <span className="text-[11px] text-black/65">{names[key]||key.replaceAll('_',' ')}</span>
          <span className="text-xs font-bold tabular-nums">{value}</span>
        </div>)}
      </div>
      <p className="text-xs font-black">Preview features (not billable delivery)</p>
      {report.preview_capabilities.map(check=><p key={check.code} className="text-[11px]">
        <span className="font-bold">{check.pass?'Configured':'Off'}</span> · {check.label}
      </p>)}
      <details className="text-xs"><summary className="cursor-pointer font-bold">Outstanding commercial and engineering requirements ({report.blockers.length})</summary>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {report.blockers.map((item,i)=><li key={item.code+'-'+i}>{item.label}</li>)}
        </ul>
      </details>
      <p className="text-[11px] leading-5 text-black/55">{report.note}</p>
    </>}
  </section>
}
