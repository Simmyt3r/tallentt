import {useCallback,useEffect,useState} from 'react'
import {ShieldCheck,SlidersHorizontal,RefreshCw} from 'lucide-react'
import {Link} from 'react-router-dom'
import {api} from '../lib/api.js'

export default function AdminOrbitAndHatReview(){
  const [tab,setTab]=useState('reviews')
  const [config,setConfig]=useState(null)
  const [weights,setWeights]=useState({})
  const [hats,setHats]=useState([])
  const [notes,setNotes]=useState({})
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const [orbit,reviews]=await Promise.all([api.getAdminOrbitConfig(),api.getAdminHatReviews()])
      setConfig(orbit);setWeights(orbit.weights)
      setHats(reviews.hats||[])
    }catch(err){setError(err.message||'Review data unavailable. Check database migrations.')}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{refresh()},[refresh])
  const total=Object.values(weights).reduce((sum,n)=>sum+Number(n||0),0)
  async function saveWeights(){
    if(total!==100){setError('Weights must add up to 100 points.');return}
    setBusy('weights');setError('');setNotice('')
    try{await api.saveAdminOrbitWeights(weights);setNotice('Orbit Score configuration saved and audited.')}
    catch(err){setError(err.message||'Failed to save weights.')}
    finally{setBusy('')}
  }
  async function review(item,decision){
    if(busy)return
    const note=(notes[item.id]??item.note??'').trim()
    if(decision==='needs_changes'&&note.length<12){setError('Provide at least 12 characters explaining the changes.');return}
    setBusy(item.id);setError('');setNotice('')
    try{
      await api.submitAdminHatReview(item.id,decision,note)
      setHats(current=>current.map(h=>h.id===item.id?{...h,decision,note}:h))
      setNotice(decision==='reviewed'?'Hat information reviewed.':'Hat owner notified about the required changes.')
    }catch(err){setError(err.message||'Review could not be saved.')}
    finally{setBusy('')}
  }
  const pending=hats.filter(h=>!h.decision)
  const reviewed=hats.filter(h=>h.decision)
  return <section className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-[17px] font-black">Orbit Score & Hat data review</h2>
      <p className="text-[12px] text-black/60">Review self-declared Hat information and configure a transparent activity score. This is not identity certification.</p>
    </header>
    <nav className="flex flex-wrap gap-2" aria-label="Governance views">
      <button type="button" onClick={()=>setTab('reviews')}
        className={`min-h-10 rounded-full px-4 text-[12px] font-bold ${tab==='reviews'?'bg-[#0A13E6] text-white':'bg-white border border-black/15'}`}>
        New Hat data ({pending.length})
      </button>
      <button type="button" onClick={()=>setTab('weights')}
        className={`min-h-10 rounded-full px-4 text-[12px] font-bold ${tab==='weights'?'bg-[#0A13E6] text-white':'bg-white border border-black/15'}`}>
        <SlidersHorizontal className="mr-1 inline-block" size={15}/> Orbit configuration
      </button>
      <button type="button" onClick={refresh} disabled={loading||!!busy}
        className="ml-auto min-h-10 rounded-full border border-black/15 bg-white px-4 text-[12px] font-bold">
        <RefreshCw className="mr-1 inline-block" size={15}/> Refresh
      </button>
    </nav>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-[12px] text-blue-800">{notice}</p>}
    {loading&&<p className="py-6 text-[12px] text-black/50">Loading review data…</p>}
    {!loading&&tab==='weights'&&config&&
      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <p className="text-[12px] text-black/60">{config.reason}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(config.labels).map(key=><label key={key}
            className="flex items-center justify-between gap-3 border-b border-black/10 pb-3 text-[12px] font-semibold">
            <span>{config.labels[key]}</span>
            <input type="number" min="0" max="40" step="1" value={weights[key]??0}
              onChange={event=>setWeights(old=>({...old,[key]:Number(event.target.value)}))}
              aria-label={`Orbit points for ${config.labels[key]}`}
              className="h-11 w-20 rounded-xl border border-black/20 px-3 text-right font-bold"/>
          </label>)}
        </div>
        <p className={`text-[13px] font-black ${total===100?'text-green-800':'text-red-700'}`}>Total: {total}/100 points</p>
        <button type="button" disabled={Boolean(busy)||total!==100}
          onClick={saveWeights} className="min-h-11 rounded-full bg-[#0A13E6] px-6 text-[12px] font-bold text-white disabled:opacity-40">Save Orbit configuration</button>
      </section>}
    {!loading&&tab==='reviews'&&
      <div className="space-y-3">
        <p className="text-[12px] text-black/60">
          New Hats remain subject to automated eligibility rules. Manual data review documents inaccurate claims and requests corrections without disrupting existing paid deals.
        </p>
        {!pending.length&&<p className="rounded-xl bg-white p-4 text-[12px] text-black/55">No newly submitted Hat data is awaiting review in the current queue.</p>}
        {[...pending,...reviewed].map(item=><article key={item.id} className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-bold">{item.hat_title}</h3>
              <p className="text-[11px] text-black/60">@{item.username} · {item.role} · {item.category}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${item.decision==='needs_changes'?'bg-amber-50 text-amber-800':item.decision==='reviewed'?'bg-green-50 text-green-800':'bg-blue-50 text-blue-700'}`}>
              {item.decision==='needs_changes'?'Changes requested':item.decision==='reviewed'?'Reviewed':'New submission'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-black/60">
            <span>{item.price_type==='range'? `${item.price_min||0}–${item.price_max||0}` : item.rate||0} {item.currency||'NGN'}</span>
            <span>{item.media_count} attached media</span>
            <span>{item.active?'Active':'Inactive'}</span>
            <span>{new Date(item.created_at).toLocaleDateString()}</span>
          </div>
          {item.motto&&<p className="text-[12px] text-black/70">{item.motto}</p>}
          <div className="flex flex-wrap gap-3 text-[12px]">
            <Link to={`/hat/${item.id}`} className="font-bold text-[#0A13E6] underline">Open Hat details</Link>
            <Link to={`/profile/${encodeURIComponent(item.username)}`} className="font-bold text-[#0A13E6] underline">Owner profile</Link>
          </div>
          <textarea aria-label={`Review note for ${item.hat_title}`} rows={2} maxLength={500}
            value={notes[item.id]??item.note??''} onChange={event=>setNotes(old=>({...old,[item.id]:event.target.value}))}
            placeholder="Explain incorrect details or required corrections…" className="w-full rounded-xl border border-black/15 p-3 text-[12px]"/>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={!!busy} onClick={()=>review(item,'reviewed')}
              className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-40">
              <ShieldCheck size={14} className="mr-1 inline-block"/> Mark reviewed
            </button>
            <button type="button" disabled={!!busy} onClick={()=>review(item,'needs_changes')}
              className="min-h-10 rounded-full border border-amber-300 px-4 text-[12px] font-bold text-amber-800 disabled:opacity-40">
              Request changes
            </button>
          </div>
        </article>)}
      </div>}
  </section>
}
