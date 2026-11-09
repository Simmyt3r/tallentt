import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import CompactPageHeader from '../components/CompactPageHeader.jsx'

const empty={title:'',location:'',work_type:''}
const newKey=()=>crypto.randomUUID()
export default function Advertise(){
  const [state,setState]=useState({advertisers:[],campaigns:[]})
  const [name,setName]=useState('')
  const [selected,setSelected]=useState('')
  const [draft,setDraft]=useState(empty)
  const [key,setKey]=useState(newKey)
  const [assets,setAssets]=useState({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [media,setMedia]=useState({campaign_id:'',media_type:'image',media_url:'',caption:''})
  async function load(){const data=await api.getMyAdvertising();setState(data);setSelected(prev=>prev||data.advertisers?.[0]?.id||'')}
  useEffect(()=>{let active=true;api.getMyAdvertising().then(v=>{if(!active)return;setState(v);setSelected(v.advertisers?.[0]?.id||'')})
    .catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
  async function execute(body,label){
    if(busy)return
    setBusy(true);setError('');setNotice('')
    try{await api.advertisingAction(body);setNotice(label);await load();return true}
    catch(e){setError(e.message||'Request failed.');return false}
    finally{setBusy(false)}
  }
  async function create(event){
    event.preventDefault()
    if(!selected){setError('Register your advertiser first.');return}
    const previousKey=key
    if(await execute({action:'ad_create',advertiser_id:selected,request_key:previousKey,...draft},'Draft campaign saved.')){
      setKey(newKey());setDraft(empty)
    }
  }
  async function addCreative(event){
    event.preventDefault()
    if(await execute({action:'ad_creative_add',...media},'Creative saved for review.')){
      setMedia(x=>({...x,media_url:'',caption:''}))
    }
  }
  async function openCreatives(id){
    try{setAssets(prev=>({...prev,[id]:{loading:true}}))
      const result=await api.getMyAdCreatives(id);setAssets(prev=>({...prev,[id]:{items:result.creatives||[]}}))}
    catch(e){setAssets(prev=>({...prev,[id]:{error:e.message}}))}
  }
  return <div className="mx-auto max-w-5xl space-y-6 pb-12">
    <CompactPageHeader title="Advertise on ChombuTar"/>
    <p className="text-sm text-black/65">Prepare campaigns and request approval. Pricing, funding and live advertising are not enabled yet.</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">{notice}</p>}
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">1. Register an advertiser</h2>
      <p className="mt-1 text-xs text-black/60">Registration is reviewed by Admin; approval does not authorize payment.</p>
      <form onSubmit={e=>{e.preventDefault();execute({action:'ad_register',legal_name:name},'Advertiser registration saved for review.')}} className="mt-3 flex flex-wrap gap-2">
        <input required minLength={2} maxLength={180} value={name} onChange={e=>setName(e.target.value)}
          aria-label="Registered business name" placeholder="Registered business name" className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"/>
        <button disabled={busy} className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-sm font-bold text-white disabled:opacity-50">Register</button>
      </form>
      {state.advertisers?.length>0&&<div className="mt-3 space-y-2">
        {state.advertisers.map(a=><p key={a.id} className="text-sm">{a.legal_name} · <strong>{a.status}</strong></p>)}
      </div>}
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">2. Create a campaign draft</h2>
      <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Advertiser
          <select required className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={selected} onChange={e=>setSelected(e.target.value)}>
            <option value="">Choose advertiser</option>{state.advertisers?.filter(a=>a.status==='pending'||a.status==='approved').map(a=><option key={a.id} value={a.id}>{a.legal_name}</option>)}
          </select></label>
        <label className="text-xs font-semibold">Campaign title
          <input required minLength={2} maxLength={180} className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label className="text-xs font-semibold">Target location (optional)
          <input maxLength={120} className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})}/></label>
        <label className="text-xs font-semibold">Work category (optional)
          <input maxLength={120} className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={draft.work_type} onChange={e=>setDraft({...draft,work_type:e.target.value})}/></label>
        <div className="sm:col-span-2"><button disabled={busy||!selected} className="min-h-11 rounded-full bg-[#0A13E6] px-6 text-sm font-bold text-white disabled:opacity-50">Save draft</button></div>
      </form>
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">3. Submit a creative</h2>
      <p className="mt-1 text-xs text-black/60">Release B accepts existing ChombuTar Cloudinary image/video URLs. A guided upload tool is planned for the next release.</p>
      <form onSubmit={addCreative} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Draft campaign
          <select required className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={media.campaign_id} onChange={e=>setMedia({...media,campaign_id:e.target.value})}>
            <option value="">Choose draft</option>{state.campaigns?.filter(c=>c.state==='draft').map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label className="text-xs font-semibold">Creative type
          <select className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={media.media_type} onChange={e=>setMedia({...media,media_type:e.target.value})}>
            <option value="image">Image banner</option><option value="video">Showroom video</option></select></label>
        <label className="text-xs font-semibold sm:col-span-2">Existing media URL
          <input type="url" required maxLength={2048} placeholder="https://res.cloudinary.com/…" className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={media.media_url} onChange={e=>setMedia({...media,media_url:e.target.value})}/></label>
        <label className="text-xs font-semibold sm:col-span-2">Caption (optional)
          <input maxLength={300} className="mt-1 block min-h-11 w-full rounded-xl border px-3" value={media.caption} onChange={e=>setMedia({...media,caption:e.target.value})}/></label>
        <div className="sm:col-span-2"><button disabled={busy||!media.campaign_id} className="min-h-11 rounded-full bg-[#0A13E6] px-6 text-sm font-bold text-white disabled:opacity-50">Submit creative</button></div>
      </form>
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Campaigns</h2>
      {state.campaigns?.length?state.campaigns.map(c=><article key={c.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
        <div><p className="text-sm font-bold">{c.title}</p><p className="text-xs text-black/60">{c.advertiser_name} · {c.state} · {c.creative_count} creative(s)</p>
        {c.review_note&&<p className="mt-1 text-xs text-red-700">{c.review_note}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-9 rounded-full border px-3 text-xs" onClick={()=>openCreatives(c.id)}>View creatives</button>
          {c.state==='draft'&&<button type="button" disabled={busy} className="min-h-9 rounded-full bg-[#0A13E6] px-4 text-xs font-bold text-white disabled:opacity-50" onClick={()=>execute({action:'ad_submit',campaign_id:c.id},'Campaign submitted for review.')}>Request review</button>}
        </div>
        {assets[c.id]&&<div className="w-full text-xs text-black/60">{assets[c.id].loading?'Loading…':assets[c.id].error||assets[c.id].items?.map(v=><p key={v.id}>{v.media_type} · {v.state} · {v.caption||'No caption'}</p>)}</div>}
      </article>):<p className="mt-4 text-sm text-black/50">No campaigns yet.</p>}
    </section>
  </div>
}
