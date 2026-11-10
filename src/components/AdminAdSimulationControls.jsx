import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

export default function AdminAdSimulationControls({campaignId,preview}){
  const [runs,setRuns]=useState(null)
  const [selected,setSelected]=useState('')
  const [detail,setDetail]=useState(null)
  const [reason,setReason]=useState('')
  const [decision,setDecision]=useState('hold')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [available,setAvailable]=useState(true)
  useEffect(()=>{
    let active=true
    setRuns(null);setSelected('');setDetail(null);setError('');setNotice('');setAvailable(true)
    api.getAdSimulations(campaignId).then(data=>{if(active)setRuns(data)})
      .catch(()=>{if(active)setAvailable(false)})
    return()=>{active=false}
  },[campaignId])
  async function refresh(){
    const data=await api.getAdSimulations(campaignId)
    setRuns(data)
    return data
  }
  async function simulate(){
    if(busy||!runs?.simulation_writes_enabled||!preview?.preview)return
    if(!window.confirm('Record a test-only advertising settlement snapshot? No real funds or wallet balances will change.'))return
    setBusy(true);setError('');setNotice('')
    try{
      const r=await api.simulateAdSettlement(campaignId)
      await refresh()
      setSelected(r.id)
      setDetail((await api.getAdSimulationDetail(r.id)).simulation)
      setNotice(r.existing?'Identical simulation already recorded; no duplicate created.':'Append-only test settlement recorded. No payout authorized.')
    }catch(e){setError(e.message||'Simulation could not be recorded.')}
    finally{setBusy(false)}
  }
  async function inspect(id){
    if(busy)return
    setBusy(true);setError('');setSelected(id)
    try{setDetail((await api.getAdSimulationDetail(id)).simulation)}
    catch(e){setError(e.message||'Could not inspect simulation.');setDetail(null)}
    finally{setBusy(false)}
  }
  async function review(){
    if(busy||!detail||!runs?.simulation_writes_enabled||reason.trim().length<12)return
    setBusy(true);setError('');setNotice('')
    try{
      await api.reviewAdSimulation(detail.id,decision,reason)
      setDetail((await api.getAdSimulationDetail(detail.id)).simulation)
      await refresh()
      setReason('')
      setNotice('Review note recorded. This does not approve payment or release a hold on real funds.')
    }catch(e){setError(e.message||'Could not save simulation review.')}
    finally{setBusy(false)}
  }
  if(!available)return <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
    Test settlement audit is unavailable. Apply the optional simulation migration on a staging database; real payouts remain disabled.
  </p>
  return <section className="space-y-3 rounded-xl border border-[#0A13E6]/15 bg-[#F7F3EB] p-3" aria-label="Test-only advertising settlement simulation">
    <div>
      <h4 className="text-[13px] font-black">Simulated settlement audit</h4>
      <p className="mt-1 text-[11px] leading-5 text-black/65">
        Candidate allocations can be snapshotted for a test audit. Entries are not real revenue, payable balances, deposits, or wallet credits.
      </p>
    </div>
    {!runs&&<p className="text-xs text-black/60">Loading recorded simulations…</p>}
    {runs&&<div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-black/65">{runs.simulations.length} recorded test snapshot(s)</span>
      {runs.simulation_writes_enabled
        ?<button type="button" disabled={busy||!preview?.preview} onClick={simulate}
          className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-40">
          Record test snapshot
        </button>
        :<span className="text-[11px] font-semibold text-amber-800">New simulations disabled outside approved preview environment</span>}
    </div>}
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="text-xs text-[#0A13E6]">{notice}</p>}
    {!!runs?.simulations?.length&&<div className="flex flex-wrap gap-2">
      {runs.simulations.map(item=><button type="button" key={item.id} disabled={busy}
        onClick={()=>inspect(item.id)} aria-pressed={selected===item.id}
        className={'rounded-full border px-3 py-2 text-[11px] disabled:opacity-50 '+(selected===item.id?'border-[#0A13E6] text-[#0A13E6]':'border-black/15 text-black/70')}>
        Version {item.revision} · {item.latest_review==='not_reviewed'?'No review':item.latest_review.replaceAll('_',' ')}
      </button>)}
    </div>}
    {detail&&<div className="space-y-3 rounded-lg bg-white p-3">
      <p className="text-xs font-bold">Snapshot #{detail.revision} · {detail.fingerprint.slice(0,12)}…</p>
      <p className="text-[11px] text-black/60">{detail.lines.length} candidate allocation lines · {detail.blockers.length} unresolved blocker(s)</p>
      <p className="text-[11px] text-black/60">All entries are append-only, including dispute and hold reviews. The source events can change after a snapshot; rerun the preflight to check for changes.</p>
      {!!detail.reviews.length&&<div className="space-y-1">
        <p className="text-xs font-bold">Review history</p>
        {detail.reviews.map((r,i)=><p key={i} className="text-[11px] text-black/65">
          {r.action.replaceAll('_',' ')} · {r.note}
        </p>)}
      </div>}
      {runs?.simulation_writes_enabled&&<div className="space-y-2">
        <label className="block text-[11px] font-semibold">Simulation review
          <select className="mt-1 block min-h-10 w-full rounded-lg border px-3" value={decision} onChange={e=>setDecision(e.target.value)}>
            <option value="hold">Place test hold</option>
            <option value="dispute">Flag test dispute</option>
            <option value="reviewed_for_testing">Second-admin review for testing (never payment authorization)</option>
          </select></label>
        <label className="block text-[11px] font-semibold">Reason (minimum 12 characters)
          <textarea className="mt-1 block w-full rounded-lg border px-3 py-2" rows={2} minLength={12} maxLength={1000}
            value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the evidence reviewed or the dispute"/>
        </label>
        <button type="button" disabled={busy||reason.trim().length<12} onClick={review}
          className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-40">
          Record review note
        </button>
      </div>}
    </div>}
  </section>
}
