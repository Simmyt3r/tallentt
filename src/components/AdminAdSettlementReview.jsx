import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

const naira=value=>{
  if(value===null||value===undefined)return 'Not established'
  try{return '₦'+BigInt(String(value)).toLocaleString('en-NG')}
  catch{return 'Unavailable'}
}
export default function AdminAdSettlementReview(){
  const [overview,setOverview]=useState(null),[campaign,setCampaign]=useState('')
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let live=true
    api.getAdSettlementOverview().then(data=>{if(live)setOverview(data)})
      .catch(e=>{if(live)setError(e.message||'Preview currently unavailable.')})
    return()=>{live=false}
  },[])
  async function inspect(){
    if(!campaign||busy)return
    setBusy(true);setError('');setPreview(null)
    try{setPreview(await api.getAdSettlementPreview(campaign))}
    catch(e){setError(e.message||'Could not inspect this campaign.')}
    finally{setBusy(false)}
  }
  return <section className="space-y-4 rounded-2xl border border-[#0A13E6]/15 bg-white p-4" aria-label="Advertising settlement preflight">
    <div>
      <h3 className="text-[15px] font-black">Advertising settlement preflight</h3>
      <p className="mt-1 text-[12px] text-black/60">
        Read-only provisional amounts. This screen cannot approve campaigns, recognize income, release funds, or post to a wallet.
      </p>
    </div>
    {!overview&&!error&&<p className="text-xs text-black/50">Loading campaigns…</p>}
    {overview&&!overview.available&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
      The advertising or qualified Discovery migrations are not yet installed. No earnings can be verified.</p>}
    {overview?.available&&<div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-bold">Select a campaign
        <select className="mt-1 block min-h-11 w-full rounded-xl border border-black/15 bg-white px-3"
          value={campaign} onChange={e=>{setCampaign(e.target.value);setPreview(null)}}>
          <option value="">Choose campaign</option>
          {overview.campaigns.map(c=><option key={c.id} value={c.id}>
            {c.title} · {c.advertiser} · {c.state}
          </option>)}
        </select>
      </label>
      <button type="button" disabled={!campaign||busy} onClick={inspect}
        className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-xs font-black text-white disabled:opacity-40">
        {busy?'Reviewing…':'Preview eligibility'}
      </button>
    </div>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {preview&&<div className="space-y-3" aria-live="polite">
      <p className="text-xs font-semibold text-black/70">{preview.campaign.title} · {preview.campaign.state}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ['Eligible Talent candidates',preview.eligible_talents],
          ['Mutually verified Explorer slots',preview.qualified_discovery_slots],
          ['Verified-receipt records (not reconciled cash)',naira(preview.verified_funding_evidence_na)],
          ['Candidate billable units',preview.billable_units??'Not established'],
          ['Provisional earned revenue',naira(preview.candidate_earned_na)],
          ['Provisional Talent pool',naira(preview.preview?.pools?.talent)],
          ['Provisional Explorer pool',naira(preview.preview?.pools?.explorer)],
          ['Unallocated Explorer pool',naira(preview.preview?.explorer?.unallocated)],
          ['Platform share before costs',naira(preview.preview?.pools?.platform)],
        ].map(([name,value])=><div key={name} className="rounded-xl bg-[#F7F3EB] p-3">
          <p className="break-words text-[14px] font-black tabular-nums">{value}</p>
          <p className="mt-1 text-[10px] font-semibold text-black/60">{name}</p>
        </div>)}
      </div>
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Settlement blocked · No payouts permitted</strong>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {preview.blockers.map(message=><li key={message}>{message}</li>)}
        </ul>
      </div>
      <p className="text-[11px] leading-5 text-black/60">{preview.qualification_policy}</p>
      <p className="text-[11px] leading-5 text-black/60">{preview.warning}</p>
      {preview.preview?.explorer?.recipients?.length>0&&<p className="text-xs text-black/60">
        Candidate Explorer recipients: {preview.preview.explorer.recipients.length} distinct users across {preview.preview.explorer.slots.length} verified eligibility slots. Individual payouts are intentionally disabled.
      </p>}
    </div>}
  </section>
}
