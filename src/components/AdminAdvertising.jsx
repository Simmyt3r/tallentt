import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import AdminAdSettlementReview from './AdminAdSettlementReview.jsx'

const sections=[
  {kind:'advertiser',key:'advertisers',heading:'Advertiser verification'},
  {kind:'creative',key:'creatives',heading:'Creative moderation'},
  {kind:'campaign',key:'campaigns',heading:'Campaign editorial review'}
]
export default function AdminAdvertising(){
  const [queue,setQueue]=useState(null)
  const [busy,setBusy]=useState('')
  const [reason,setReason]=useState({})
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function refresh(){setError('');try{setQueue(await api.getAdReviewQueue())}catch(e){setError(e.message)}}
  useEffect(()=>{refresh()},[])
  async function decide(kind,id,decision){
    if(busy)return
    if(decision==='rejected'&&(!reason[id]||reason[id].trim().length<8)){setError('A reason of at least 8 characters is required for rejection.');return}
    setBusy(id);setError('');setNotice('')
    try{
      await api.adminAdReview({kind,id,decision,note:reason[id]||''})
      setNotice(kind+' '+decision+'. This is editorial approval only; billing remains disabled.')
      await refresh()
    }catch(e){setError(e.message||'Could not review this item.')}
    finally{setBusy('')}
  }
  return <div className="space-y-5 p-4" aria-label="Advertising editorial review">
    <div><h2 className="text-lg font-black">Advertiser & Campaign Review</h2>
      <p className="text-xs text-black/60">Review identity, campaign content and creative assets. No billing, sponsored placement or cash release is enabled.</p></div>
    <button type="button" onClick={refresh} className="min-h-10 rounded-full border px-4 text-xs font-bold">Refresh queue</button>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">{notice}</p>}
    {!queue&&!error&&<p role="status" className="text-xs">Loading advertising reviews…</p>}
    <AdminAdSettlementReview/>
    {sections.map(section=><section key={section.kind} className="space-y-3">
      <h3 className="text-sm font-black">{section.heading}</h3>
      {(queue?.[section.key]||[]).length===0?<p className="text-xs text-black/50">No pending items.</p>:queue[section.key].map(item=><article key={item.id} className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
        <div><p className="break-words text-sm font-bold">{item.legal_name||item.title||item.campaign_title}</p>
          <p className="text-xs text-black/50">{item.owner_username||item.media_type||'Campaign'} · {item.id.slice(0,8)}</p></div>
        {item.media_url&&<div className="overflow-hidden rounded-lg bg-zinc-100">
          {item.media_type==='image'?<img src={item.media_url} alt={item.caption||'Pending advertising image'} loading="lazy" className="max-h-52 w-full object-contain"/>:
            <video src={item.media_url} controls playsInline preload="metadata" className="max-h-52 w-full object-contain"/>}
          {item.caption&&<p className="p-2 text-xs">{item.caption}</p>}
        </div>}
        {section.kind==='campaign'&&<p className="text-xs text-black/50">Location: {item.target_location||'Any'} · Category: {item.target_work_type||'Any'} · Approved creatives: {item.approved_creatives}</p>}
        <label className="block text-xs font-semibold">Review note
          <textarea value={reason[item.id]||''} maxLength={1000} onChange={e=>setReason(prev=>({...prev,[item.id]:e.target.value}))}
            placeholder="Required for rejection; explain policy or evidence concerns" className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm" rows={2}/></label>
        <div className="flex gap-2">
          <button type="button" disabled={busy!==''} onClick={()=>decide(section.kind,item.id,'approved')}
            className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy!==''} onClick={()=>decide(section.kind,item.id,'rejected')}
            className="min-h-10 rounded-full border border-red-200 px-4 text-xs font-bold text-red-700 disabled:opacity-50">Reject</button>
        </div>
      </article>)}
    </section>)}
  </div>
}
