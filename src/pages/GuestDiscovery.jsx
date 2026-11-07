import {useEffect,useMemo,useState} from 'react'
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom'
import {ArrowLeft,ArrowRight,Bookmark,Heart,MessageCircle,Share2,UserRoundPlus,MapPin,Eye,BriefcaseBusiness} from 'lucide-react'
import {api} from '../lib/api.js'
import GuestActionGate from '../components/GuestActionGate.jsx'

export function formatGuestPrice(hat){
  const money=n=>Number.isFinite(Number(n))?new Intl.NumberFormat('en-NG',{style:'currency',currency:hat.currency||'NGN',maximumFractionDigits:0}).format(Number(n)):null
  if(hat.price_type==='range'&&hat.price_min!=null){
    const from=money(hat.price_min),to=hat.price_max!=null?money(hat.price_max):null
    return to&&hat.price_max!==hat.price_min?from+' – '+to:from
  }
  return hat.rate!=null?money(hat.rate):'Price on request'
}
export function CountLabel({value,label}){
  return <span>{label} {value===null||value===undefined?'—':Number(value).toLocaleString('en-NG')}</span>
}
function GuestMedia({media=[],className='h-full w-full'}){
  const first=media.find(m=>m?.url)
  if(!first)return <div className={className+' grid place-items-center bg-[#E9E5DB] text-[13px] text-black/45'}>Media not published</div>
  if(first.type==='video')return <video src={first.url} controls playsInline preload="metadata" className={className+' bg-black object-contain'} />
  if(first.type==='audio')return <div className={className+' grid place-items-center bg-zinc-900 p-4'}><audio src={first.url} controls preload="none" className="w-full"/></div>
  return <img src={first.url} loading="lazy" alt={first.caption||'Published Talent work'} className={className+' object-cover'}/>
}
function GuestActions({hat,onGate,compact=false}){
  const info={username:hat.username,hat:hat.id,name:hat.owner_full_name||hat.username}
  const gate=intent=>onGate({intent,...info})
  return <div className={'flex flex-wrap items-center gap-2 '+(compact?'mt-2':'mt-4')}>
    <button type="button" onClick={()=>gate('keepup')} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#E8B447] px-4 text-[12px] font-extrabold text-black"><UserRoundPlus size={16}/>+ KeepUp</button>
    <button type="button" onClick={()=>gate('book')} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-black/20 px-3 text-[12px] font-bold"><BriefcaseBusiness size={15}/>Book</button>
    <button type="button" onClick={()=>gate('like')} aria-label={'Like '+hat.hat_title} className="grid h-10 w-10 place-items-center rounded-full border border-black/10"><Heart size={16}/></button>
    <button type="button" onClick={()=>gate('share')} aria-label={'Share '+hat.hat_title} className="grid h-10 w-10 place-items-center rounded-full border border-black/10"><Share2 size={16}/></button>
    {!compact&&<button type="button" onClick={()=>gate('save')} aria-label={'Save '+hat.hat_title} className="grid h-10 w-10 place-items-center rounded-full border border-black/10"><Bookmark size={16}/></button>}
  </div>
}
export function GuestHatCard({hat,onGate,large=false}){
  return <article className={'overflow-hidden rounded-[22px] bg-white shadow-sm '+(large?'mx-auto w-full max-w-[780px]':'min-w-0')}>
    <Link to={'/talent/'+encodeURIComponent(hat.id)} className={'block overflow-hidden bg-[#E9E5DB] '+(large?'h-[min(56vh,460px)]':'aspect-[5/3]')} aria-label={'View '+hat.hat_title}>
      <GuestMedia media={hat.media} className="h-full w-full"/>
    </Link>
    <div className="p-4 sm:p-5">
      <Link to={'/profile/'+encodeURIComponent(hat.username)} className="text-[12px] font-bold text-black/55 hover:underline">
        {hat.owner_full_name||hat.username} · ^{hat.username}
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[19px] font-black">{hat.hat_title}</h2>
        <span className="text-[15px] font-black">{formatGuestPrice(hat)}</span>
      </div>
      <p className="mt-1 text-[12px] text-black/55">{hat.category}{hat.lga?' · '+hat.lga:''}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-black/60">
        <CountLabel label="Orbit" value={hat.orbit_score}/>
        <CountLabel label="Discovery" value={hat.discovery_count}/>
        <CountLabel label="KeepUp" value={hat.keepup_count}/>
      </div>
      <GuestActions hat={hat} onGate={onGate} compact={!large}/>
    </div>
  </article>
}
function VibePreview({post,onGate}){
  const info={username:post.username,name:post.owner_full_name||post.username}
  return <article className="rounded-[22px] bg-white p-5 shadow-sm">
    <Link to={'/profile/'+encodeURIComponent(post.username)} className="text-[13px] font-extrabold hover:underline">{info.name} · ^{post.username}</Link>
    <p className="mt-1 text-[11px] text-black/45">{new Date(post.created_at).toLocaleDateString('en-NG')}</p>
    <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-6">{post.body}</p>
    {post.media?.length>0&&<div className="mt-3 aspect-[16/9] overflow-hidden rounded-[14px]"><GuestMedia media={post.media}/></div>}
    <p className="mt-3 text-[11px] text-black/55">❤ {post.likes} likes · {post.comments} comments</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {['like','comment','share','keepup'].map(action=><button type="button" key={action}
        onClick={()=>onGate({...info,intent:action,hat:action==='like'||action==='share'||action==='comment'?null:undefined})}
        className="min-h-10 rounded-full border border-black/10 px-3 text-[12px] font-semibold">
        {action==='keepup'?'+ KeepUp':action==='comment'?'Comment':action[0].toUpperCase()+action.slice(1)}
      </button>)}
    </div>
  </article>
}

export default function GuestDiscovery({mode='showroom'}){
  const [search,setSearch]=useState('')
  const [city,setCity]=useState('')
  const [term,setTerm]=useState('')
  const [page,setPage]=useState(0)
  const [nextPage,setNextPage]=useState(null)
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [moreLoading,setMoreLoading]=useState(false)
  const [error,setError]=useState('')
  const [gate,setGate]=useState(null)
  useEffect(()=>{const t=setTimeout(()=>setTerm(search.trim()),250);return()=>clearTimeout(t)},[search])
  useEffect(()=>{
    let disposed=false
    setItems([]);setPage(0);setNextPage(null);setLoading(true);setError('')
    api.getGuestDiscovery({mode,search:term,city:mode==='vibes'?'':city,page:0})
      .then(data=>{if(disposed)return;setItems(mode==='vibes'?data.posts||[]:data.hats||[]);setNextPage(data.nextPage)})
      .catch(err=>{if(!disposed)setError(err.message||'Could not open public discovery.')})
      .finally(()=>{if(!disposed)setLoading(false)})
    return()=>{disposed=true}
  },[mode,term,city])
  async function more(){
    if(nextPage==null||moreLoading)return
    setMoreLoading(true);setError('')
    try{
      const data=await api.getGuestDiscovery({mode,search:term,city:mode==='vibes'?'':city,page:nextPage})
      const moreItems=mode==='vibes'?data.posts||[]:data.hats||[]
      setItems(old=>{const ids=new Set(old.map(i=>i.id));return [...old,...moreItems.filter(i=>!ids.has(i.id))]})
      setPage(nextPage);setNextPage(data.nextPage)
    }catch(e){setError(e.message||'Could not load more.')}
    finally{setMoreLoading(false)}
  }
  const title=mode==='bento'?'Bento Feed':mode==='vibes'?'Hits & Vibes':'Guest Showroom'
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-amber-900">Discover without signing up</p>
        <h1 className="mt-1 text-[27px] font-black tracking-tight sm:text-[36px]">{title}</h1>
        <p className="mt-1 text-[13px] text-black/55">{mode==='showroom'?'One fine work at a time.':mode==='bento'?'Explore published Talent cards and their latest Orbit.':'Public work and stories from Talent.'}</p></div>
      <Link to="/auth?mode=signup" className="min-h-10 rounded-full bg-[#E8B447] px-4 py-3 text-[12px] font-extrabold">Sign Up — Free</Link>
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="min-w-[180px] flex-1"><span className="sr-only">Search public Talent</span>
        <input value={search} onChange={event=>setSearch(event.target.value)}
          aria-label="Search public Talent" placeholder="Search Talent, work or category"
          className="h-12 w-full rounded-full border border-black/15 bg-white px-5 text-[13px] outline-none focus:border-amber-700"/></label>
      {mode!=='vibes'&&<label className="min-w-[155px] max-w-[245px] flex-1"><span className="sr-only">Filter by city or LGA</span>
        <input value={city} onChange={event=>setCity(event.target.value)}
          aria-label="Filter by city or LGA" placeholder="City / LGA (optional)"
          className="h-12 w-full rounded-full border border-black/15 bg-white px-5 text-[13px] outline-none focus:border-amber-700"/></label>}
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
    {loading?<p role="status" className="py-16 text-center text-black/50">Loading public posts…</p>
      :items.length===0?<div className="rounded-2xl bg-white p-12 text-center text-[13px] text-black/55">No approved public posts match this search yet. Try a broader term or location.</div>
      :mode==='vibes'?<div className="mx-auto grid max-w-[740px] gap-4">{items.map(post=><VibePreview key={post.id} post={post} onGate={setGate}/>)}</div>
      :mode==='showroom'?<div className="mx-auto grid max-w-[800px] max-h-[78vh] snap-y snap-mandatory gap-5 overflow-y-auto overscroll-contain" aria-label="Guest Showroom posts">
        {items.map(hat=><div key={hat.id} className="snap-start"><GuestHatCard hat={hat} large onGate={setGate}/></div>)}</div>
      :<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] items-start gap-4">
        {items.map(hat=><GuestHatCard key={hat.id} hat={hat} onGate={setGate}/>)}</div>}
    {nextPage!==null&&!loading&&<div className="text-center"><button type="button" disabled={moreLoading} onClick={more}
      className="min-h-11 rounded-full border border-black/20 bg-white px-6 text-[12px] font-bold disabled:opacity-50">
      {moreLoading?'Loading…':'Explore more'}</button></div>}
    <GuestActionGate intent={gate} onClose={()=>setGate(null)}/>
  </div>
}

export function GuestHat(){
  const {hatId}=useParams()
  const [hat,setHat]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [index,setIndex]=useState(0),[gate,setGate]=useState(null)
  const navigate=useNavigate()
  useEffect(()=>{
    let cancelled=false
    setLoading(true);setError('')
    ;(async()=>{
      try{
        const a=await api.getGuestDiscovery({mode:'showroom',id:hatId})
        const result=a.hats?.[0]||(await api.getGuestDiscovery({mode:'bento',id:hatId})).hats?.[0]
        if(!cancelled){if(!result)throw new Error('This Hat is not public.');setHat(result)}
      }catch(e){if(!cancelled)setError(e.message||'Could not load this Hat.')}
      finally{if(!cancelled)setLoading(false)}
    })()
    return()=>{cancelled=true}
  },[hatId])
  if(loading)return <p role="status" className="py-20 text-center">Loading public Hat…</p>
  if(error||!hat)return <p role="alert" className="py-20 text-center text-red-700">{error||'Hat not found.'}</p>
  const media=hat.media||[],current=media[index],info={username:hat.username,hat:hat.id,name:hat.owner_full_name||hat.username}
  return <div className="mx-auto max-w-[810px] space-y-4">
    <button type="button" onClick={()=>navigate(-1)} className="inline-flex items-center gap-1 text-[13px] font-bold"><ArrowLeft size={15}/>Back</button>
    <div className="overflow-hidden rounded-[24px] bg-white">
      <div className="aspect-[4/3] max-h-[540px] bg-zinc-100">
        <GuestMedia key={index} media={current?[current]:[]} className="h-full w-full"/>
      </div>
      {media.length>1&&<div className="flex flex-wrap items-center justify-center gap-3 p-3">
        <button onClick={()=>setIndex(i=>(i-1+media.length)%media.length)} aria-label="Previous media" className="grid h-10 w-10 place-items-center rounded-full border"><ArrowLeft size={18}/></button>
        <span className="text-[12px] font-semibold">{index+1} / {media.length}</span>
        <button onClick={()=>setIndex(i=>(i+1)%media.length)} aria-label="Next media" className="grid h-10 w-10 place-items-center rounded-full border"><ArrowRight size={18}/></button>
      </div>}
      <div className="space-y-3 p-5">
        <h1 className="text-[25px] font-black">{hat.hat_title}</h1>
        <p className="text-[13px] text-black/55">{hat.category} · {formatGuestPrice(hat)}</p>
        <Link to={'/profile/'+encodeURIComponent(hat.username)} className="block font-bold text-[#0A13E6] hover:underline">{info.name} · View Profile and Gallery</Link>
        <div className="flex flex-wrap gap-4 text-[12px] font-semibold text-black/60">
          <CountLabel label="Orbit" value={hat.orbit_score}/><CountLabel label="Discovery" value={hat.discovery_count}/><CountLabel label="KeepUp" value={hat.keepup_count}/>
        </div>
        {hat.motto&&<p className="text-[14px] text-black/70">{hat.motto}</p>}
        <GuestActions hat={hat} onGate={setGate}/>
        <div className="flex flex-wrap gap-2">
          {['collab','hire','sponsor','message'].map(intent=><button type="button" key={intent} onClick={()=>setGate({...info,intent})}
            className="min-h-10 rounded-full border border-black/10 px-4 text-[12px] font-semibold">
            {intent==='collab'?'Collab':intent[0].toUpperCase()+intent.slice(1)}
          </button>)}
        </div>
      </div>
    </div>
    <GuestActionGate intent={gate} onClose={()=>setGate(null)}/>
  </div>
}

export function GuestWorkPass(){
  const {username}=useParams()
  const [data,setData]=useState(null),[error,setError]=useState('')
  useEffect(()=>{let disposed=false;api.getWorkPass(username)
    .then(value=>{if(!disposed)setData(value)})
    .catch(e=>{if(!disposed)setError(e.message)})
    return()=>{disposed=true}},[username])
  if(error)return <p role="alert" className="py-10 text-red-700">{error}</p>
  if(!data)return <p role="status" className="py-10">Loading public Work Pass…</p>
  return <div className="mx-auto max-w-[560px] space-y-4">
    <Link to={'/profile/'+encodeURIComponent(username)} className="inline-flex items-center gap-2 text-[13px] font-bold"><ArrowLeft size={15}/>Profile</Link>
    <div className="rounded-[28px] border border-[#D4A13F] bg-[#17191F] p-7 text-white shadow-xl">
      <p className="text-[12px] font-bold uppercase tracking-[.2em] text-[#E8B447]">ChombuTar Work Pass</p>
      <h1 className="mt-3 text-[27px] font-black">{data.user?.name||username}</h1>
      <p className="mt-1 text-[13px] text-white/60">^{data.user?.username} · {data.tier||'Talent'}</p>
      <div className="mt-7 grid grid-cols-2 gap-3">
        {[
          ['Orbit',data.orbit],['Talent Orbit',data.roleOrbit?.talent],['Client Orbit',data.roleOrbit?.client],
          ['Completed jobs',data.completedJobs],['Successful hires',data.successfulHires],
        ].map(([label,value])=><div className="rounded-xl bg-white/10 p-3" key={label}><p className="text-[11px] text-white/60">{label}</p><p className="text-[20px] font-black">{typeof value==='object'&&value!==null?(value.score??'—'):(value??'—')}</p></div>)}
      </div>
    </div>
    <p className="text-[12px] text-black/55">Public Work Pass preview. Printing and private payment evidence are available only to their authorized account holder.</p>
  </div>
}

export function GuestProfile(){
  const {username}=useParams()
  const [profile,setProfile]=useState(null),[hats,setHats]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[gate,setGate]=useState(null)
  useEffect(()=>{
    let disposed=false
    setLoading(true);setError('')
    Promise.all([api.getUserProfile(username),api.getGuestDiscovery({mode:'showroom',username}),api.getGuestDiscovery({mode:'bento',username})])
      .then(([data,a,b])=>{if(disposed)return;setProfile(data);setHats([...new Map([...(a.hats||[]),...(b.hats||[])].map(h=>[h.id,h])).values()])})
      .catch(e=>{if(!disposed)setError(e.message||'Profile could not be loaded.')})
      .finally(()=>{if(!disposed)setLoading(false)})
    return()=>{disposed=true}
  },[username])
  if(loading)return <p role="status" className="py-14 text-center">Loading Talent profile…</p>
  if(error||!profile?.user)return <p role="alert" className="py-14 text-center text-red-700">{error||'Profile unavailable.'}</p>
  const person=profile.user,name=person.fullName||person.username
  const info={username:person.username,name}
  const gallery=[...(profile.portfolio||[]),...(profile.gallery||[])]
    .filter(item=>item?.url&&['image','video'].includes(item.type)).slice(0,24)
  const social=hats[0]
  return <div className="mx-auto max-w-[980px] space-y-6">
    <div className="flex flex-wrap items-center gap-4 rounded-[24px] bg-white p-5 sm:p-7">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#E6D9BA] text-[29px] font-black">
        {person.avatarUrl?<img src={person.avatarUrl} alt="" className="h-full w-full object-cover"/>:name[0]}</div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[25px] font-black">{name}</h1><p className="text-[13px] text-black/55">^{person.username} · {person.headline||person.role}</p>
        {person.lga&&<p className="mt-1 flex items-center gap-1 text-[12px] text-black/45"><MapPin size={13}/>{person.lga}</p>}
        <p className="mt-2 text-[13px] text-black/70">{person.bio||''}</p>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={()=>setGate({...info,intent:'keepup'})} className="min-h-11 rounded-full bg-[#E8B447] px-5 text-[12px] font-extrabold">+ KeepUp</button>
        <Link to={'/work-pass/'+encodeURIComponent(person.username)} className="min-h-11 rounded-full border border-black/15 px-5 py-3 text-center text-[12px] font-bold">View Work Pass</Link>
      </div>
    </div>
    <div className="flex flex-wrap gap-4 text-[13px] font-semibold text-black/65">
      <CountLabel label="Orbit" value={profile.orbit?.score}/>
      <CountLabel label="Discovery" value={social?.discovery_count}/>
      <CountLabel label="KeepUp" value={social?.keepup_count}/>
    </div>
    <section className="space-y-3"><h2 className="text-[20px] font-black">Published Hats</h2>
      {hats.length?<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] items-start gap-4">
        {hats.map(h=><GuestHatCard key={h.id} hat={h} onGate={setGate}/>)}</div>
        :<p className="rounded-xl bg-white p-5 text-[13px] text-black/55">No approved public Hats to display.</p>}
    </section>
    <section className="space-y-3"><h2 className="text-[20px] font-black">Gallery</h2>
      {gallery.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {gallery.map((item,i)=><div key={item.id||i} className="aspect-square overflow-hidden rounded-xl bg-black/5">
          <GuestMedia media={[item]} className="h-full w-full"/></div>)}</div>
        :<p className="rounded-xl bg-white p-5 text-[13px] text-black/55">No public gallery media yet.</p>}
    </section>
    <div className="flex flex-wrap gap-2">{['book','collab','hire','sponsor','message'].map(intent=><button key={intent} type="button" onClick={()=>setGate({...info,intent})}
      className="min-h-11 rounded-full border border-black/15 bg-white px-5 text-[12px] font-bold">{intent==='book'?'Book Talent':intent==='collab'?'Collab':intent[0].toUpperCase()+intent.slice(1)}</button>)}</div>
    <GuestActionGate intent={gate} onClose={()=>setGate(null)}/>
  </div>
}
