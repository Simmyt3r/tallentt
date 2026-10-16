import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'

export default function AdminShowroomGallery() {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const refresh=useCallback(async()=>{
    setLoading(true);setError('')
    try {
      const data=await api.getAdminGalleryQueue()
      setItems(data.items||[])
    } catch(err) {setError(err.message||'Could not load gallery review queue.')}
    finally {setLoading(false)}
  },[])
  useEffect(()=>{refresh()},[refresh])
  async function review(item,decision) {
    if(busy) return
    const question=decision==='approve'
      ? 'Approve this independent Showroom post? Inspect the entire image or full video first.'
      : 'Reject this Showroom post? It will remain hidden.'
    if(!window.confirm(question))return
    setBusy(item.id);setError('');setNotice('')
    try {
      await api.moderateGalleryPost(item.id,decision)
      setNotice(decision==='approve'?'Approved and published.':'Rejected and hidden.')
      await refresh()
    } catch(err) {setError(err.message||'Review could not be saved.')}
    finally {setBusy('')}
  }
  return <section className="space-y-4" aria-label="Independent Showroom gallery moderation">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-black">Independent Showroom gallery</h2>
        <p className="mt-1 text-[12px] text-black/60">Photos and videos that are not linked to Hats or booking. Review pending media and subscriber reports.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading||Boolean(busy)}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/20 px-4 text-[12px] font-bold">
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-[#EEF0FF] p-3 text-[12px]">{notice}</p>}
    {loading&&<p role="status" className="py-5 text-[12px] text-black/50">Loading gallery review queue…</p>}
    {!loading&&!items.length&&!error&&<p className="rounded-xl bg-white p-6 text-[12px] text-black/50">No gallery posts currently require review.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map(item=><article key={item.id} className="overflow-hidden rounded-2xl border border-black/10 bg-white">
        <div className="aspect-video bg-black">
          {item.media_type==='video'
            ? <video src={item.media_url} controls preload="metadata" className="h-full w-full object-contain"/>
            : <img src={item.media_url} alt="Submitted Showroom review media" className="h-full w-full object-contain"/>}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
            <span>@{item.username} · {item.media_type}</span>
            <span>{item.moderation_status}</span>
          </div>
          <p className="break-words text-[12px]">{item.caption||'No caption'}</p>
          <p className="text-[11px] text-black/55">
            {item.moderation_reason||'Awaiting review'} · {item.reports} reports
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={()=>review(item,'approve')}
              className="min-h-10 flex-1 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-40">Approve</button>
            <button type="button" disabled={Boolean(busy)} onClick={()=>review(item,'reject')}
              className="min-h-10 flex-1 rounded-full border border-red-300 px-4 text-[12px] font-bold text-red-700 disabled:opacity-40">Reject</button>
          </div>
        </div>
      </article>)}
    </div>
  </section>
}
