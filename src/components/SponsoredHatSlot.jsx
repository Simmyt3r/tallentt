// Compact sponsor panel. Batched public reads, no views, impressions, Orbit,
// clicks or wallet activity are recorded by this component.
import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import {useOptionalAuth} from '../context/AuthContext.jsx'

const pending=new Map()
let scheduled=false
async function flush(){
  scheduled=false
  const batch=[...pending.entries()].slice(0,30)
  for(const [id] of batch)pending.delete(id)
  if(!batch.length)return
  try{
    const result=await api.getSponsoredPlacements(batch.map(([id])=>id))
    for(const [id,waiters] of batch)for(const done of waiters)done(result?.placements?.[id]||null)
  }catch{
    for(const [,waiters] of batch)for(const done of waiters)done(null)
  }
  if(pending.size&&!scheduled){scheduled=true;queueMicrotask(flush)}
}
function fetchPlacement(id){
  return new Promise(resolve=>{
    const waiters=pending.get(id)||[]
    waiters.push(resolve)
    pending.set(id,waiters)
    if(!scheduled){scheduled=true;queueMicrotask(flush)}
  })
}
export default function SponsoredHatSlot({hatId,ownerId,compact=false}){
  const user=useOptionalAuth()?.user
  const [placement,setPlacement]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!hatId)return
    let alive=true
    fetchPlacement(hatId).then(item=>{if(alive)setPlacement(item)})
    return()=>{alive=false}
  },[hatId])
  useEffect(()=>{
    if(!placement?.ends_at)return
    const remaining=Date.parse(placement.ends_at)-Date.now()
    if(remaining<=0){setPlacement(null);return}
    const t=setTimeout(()=>setPlacement(null),Math.min(remaining,2147483647))
    return()=>clearTimeout(t)
  },[placement?.id,placement?.ends_at])
  if(!placement)return null
  const isOwner=Boolean(user?.id&&ownerId&&user.id===ownerId)
  async function detach(){
    if(busy)return
    if(!window.confirm('Detach this sponsored advert from your Hat? This stops future display. Any earning adjustment follows the campaign terms.'))return
    setBusy(true);setError('')
    try{await api.detachSponsoredPlacement(placement.id);setPlacement(null)}
    catch(e){setError(e.message||'Could not detach this advertisement.')}
    finally{setBusy(false)}
  }
  return <aside className={'ct-sponsored-slot min-w-0 overflow-hidden rounded-xl border border-[#0A13E6]/20 bg-[#F7F3EB] p-2 text-[#141b36] '+(compact?'mt-1':'mt-3')}
    aria-label="Sponsored advertisement">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="rounded bg-[#0A13E6] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">Sponsored</span>
      {isOwner&&<button type="button" disabled={busy} onClick={detach}
        className="min-h-8 rounded-full px-2 text-[10px] font-bold text-[#0A13E6] underline underline-offset-2 disabled:opacity-50">
        {busy?'Detaching…':'Detach'}
      </button>}
    </div>
    <div className="flex min-w-0 items-center gap-2">
      <img src={placement.image_url} loading="lazy" alt={placement.caption||'Paid sponsor creative'}
        className={(compact?'h-10 w-16':'h-12 w-20')+' shrink-0 rounded-md bg-white object-contain'}/>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-black">{placement.sponsor_name}</p>
        {placement.caption&&<p className="line-clamp-2 break-words text-[10px] text-black/65">{placement.caption}</p>}
      </div>
    </div>
    {error&&<p role="alert" className="mt-1 text-[10px] text-red-700">{error}</p>}
  </aside>
}
