import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

export default function AdParticipationControls(){
  const [policy,setPolicy]=useState(null)
  const [ack,setAck]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function refresh(){setPolicy(await api.getTalentAdvertisingPolicy())}
  useEffect(()=>{let live=true;api.getTalentAdvertisingPolicy().then(v=>{if(live)setPolicy(v)})
    .catch(e=>{if(live)setError(e.message||'Advertising preferences unavailable.')})
    .finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}},[])
  async function accept(){
    if(!ack||busy||!policy)return
    setBusy('accept');setError('');setNotice('')
    try{await api.acceptTalentAdPolicy(policy.policy_version);await refresh()
      setNotice('Advertising policy accepted. Your work is not yet carrying paid advertisements.')}
    catch(e){setError(e.message||'Could not save advertising acceptance.')}
    finally{setBusy('')}
  }
  async function detach(placement){
    if(busy||!window.confirm('Detach this sponsored advertisement from your Hat?'))return
    setBusy(placement.id);setError('');setNotice('')
    try{await api.detachSponsoredPlacement(placement.id);await refresh();setNotice('Advertisement detached from your Hat.')}
    catch(e){setError(e.message||'Could not detach this advertisement.')}
    finally{setBusy('')}
  }
  if(loading)return <p className="text-xs text-black/50">Loading advertising preferences…</p>
  if(!policy?.available)return <p className="text-xs text-black/55">Advertising preferences will be available after the sponsored-placement database migration.</p>
  if(!policy.eligible)return null
  return <section aria-label="Talent advertising participation" className="space-y-3">
    <h2 className="text-[14px] font-black">Sponsored placements on my work</h2>
    <p className="text-[12px] leading-6 text-black/65">
      If you accept, ChombuTar may automatically attach a clearly labelled sponsor banner below eligible public Hat and Showroom content. The sponsor does not own your work, and an advert is not a personal endorsement. You can detach any placement. Any earnings depend on the completed 30-day campaign and verification; no income is guaranteed.
    </p>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="text-xs text-[#0A13E6]">{notice}</p>}
    {!policy.accepted?<div className="space-y-3 rounded-xl border border-[#0A13E6]/15 bg-white p-3">
      <label className="flex items-start gap-2 text-xs leading-5">
        <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 h-4 w-4 accent-[#0A13E6]"/>
        I understand that approved sponsor banners may be attached automatically and that I can detach them at any time.
      </label>
      <button type="button" disabled={!ack||Boolean(busy)} onClick={accept} className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-45">
        Accept advertising policy</button>
    </div>:<p className="text-xs font-semibold text-[#0A13E6]">Advertising policy accepted</p>}
    {!!policy.active?.length&&<div className="space-y-2">
      <p className="text-xs font-black">Reserved and active placements</p>
      {policy.active.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 p-3">
        <div className="min-w-0"><p className="text-xs font-semibold">{p.sponsor_name}</p>
          <p className="text-[11px] text-black/55">{p.campaign_title} · {p.state}</p></div>
        <button type="button" disabled={Boolean(busy)} onClick={()=>detach(p)}
          className="min-h-9 rounded-full border border-[#0A13E6]/25 px-3 text-xs font-bold text-[#0A13E6] disabled:opacity-50">Detach</button>
      </div>)}
    </div>}
  </section>
}
