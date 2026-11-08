import {useCallback,useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowLeft,ArrowRight,Pause,Play,ArrowUpRight,Sparkles,Compass,ShieldCheck} from 'lucide-react'
import {api} from '../lib/api.js'
import GuestActionGate from '../components/GuestActionGate.jsx'
import {CountLabel,formatGuestPrice} from './GuestDiscovery.jsx'
import '../styles/guest.css'

const MODES=['showroom','bento','vibes']
const PANEL_NAMES=['Showroom','Bento Feed','Hits & Vibes']
const CAPTIONS=[
  'Showroom — One fine work at a time.',
  'Bento Feed — Talent cards ranked by their latest Orbit.',
  'Hits & Vibes — New public work from Talent you can KeepUp with.',
]
function IntroMedia({item}){
  const media=item?.media?.find(m=>m?.url)
  if(!media)return <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#F5D99C] to-[#B6BCCB] text-center text-[15px] font-bold text-black/50">
    Discover what Talent can do.</div>
  if(media.type==='image')return <img className="h-full w-full object-cover" loading="lazy" alt={media.caption||item.hat_title||'Talent work'} src={media.url}/>
  if(media.type==='video')return <video className="h-full w-full object-contain bg-black" controls playsInline preload="metadata" src={media.url}/>
  return <div className="grid h-full w-full place-items-center bg-black text-white">Listen to this Talent</div>
}
function LandingPanel({mode,data,onKeepUp}){
  const hats=data.showroom||[],bento=data.bento||[],vibes=data.vibes||[]
  if(mode==='showroom'){
    const item=hats[0]
    return <div className="ct-showcase-card mx-auto h-full max-w-[570px] overflow-hidden rounded-[22px] bg-white shadow-xl">
      <div className="h-[60%] overflow-hidden"><IntroMedia item={item}/></div>
      <div className="space-y-1 px-5 py-4">
        {item?<><div className="flex items-center justify-between gap-3"><p className="text-[14px] font-black">{item.owner_full_name||item.username}</p><span className="rounded-full bg-[#E8B447] px-2.5 py-1 text-[10px] font-bold">Trending</span></div>
          <p className="truncate text-[14px] font-bold">{item.hat_title} · {item.category}</p>
          <p className="truncate text-[13px] font-black">{formatGuestPrice(item)}</p>
          <div className="flex flex-wrap gap-3 text-[11px] text-black/60"><CountLabel label="Orbit" value={item.orbit_score}/><CountLabel label="Discovery" value={item.discovery_count}/><CountLabel label="KeepUp" value={item.keepup_count}/></div>
          <Link to={'/talent/'+encodeURIComponent(item.id)} className="inline-flex items-center gap-1 text-[12px] font-bold text-[#0A13E6]">View this Hat <ArrowUpRight size={13}/></Link>
        </>:<><p className="text-[17px] font-black">A home for fine work</p>
          <p className="mt-2 text-[12px] text-black/55">Approved Showroom media appears here when Talent publish.</p></>}
      </div>
    </div>
  }
  if(mode==='bento')return <div className="ct-bento-grid mx-auto grid h-full max-w-[730px] grid-cols-2 gap-3 overflow-y-auto sm:gap-4">
    {bento.length?bento.slice(0,4).map((item,i)=><article key={item.id} className="ct-bento-card min-w-0 overflow-hidden rounded-[18px] bg-white shadow-sm">
      <div className="h-[40%] min-h-[76px] overflow-hidden"><IntroMedia item={item}/></div>
      <div className="p-3">
        <p className="text-[10px] font-black text-amber-900">#{i+1} · Orbit {item.orbit_score??'—'}</p>
        <Link to={'/profile/'+encodeURIComponent(item.username)} className="block truncate text-[13px] font-black">{item.owner_full_name||item.username}</Link>
        <p className="truncate text-[11px] text-black/60">{item.hat_title}</p>
        <p className="mt-1 flex flex-wrap gap-2 text-[10px] text-black/55"><CountLabel label="Discovery" value={item.discovery_count}/><CountLabel label="KeepUp" value={item.keepup_count}/></p>
        <button type="button" onClick={()=>onKeepUp({intent:'keepup',username:item.username,name:item.owner_full_name||item.username,hat:item.id})}
          className="mt-2 min-h-8 rounded-full bg-[#E8B447] px-3 text-[11px] font-extrabold">+ KeepUp</button>
      </div>
    </article>):<div className="col-span-2 grid place-items-center rounded-xl bg-white/80 p-7 text-center text-[13px] text-black/60">Published Bento cards will appear here as Talent join.</div>}
  </div>
  return <div className="ct-vibes-feed mx-auto h-full max-w-[650px] space-y-3 overflow-y-auto rounded-[22px] bg-white/90 p-4 shadow-sm sm:p-6">
    {vibes.length?vibes.slice(0,3).map((post,i)=><article key={post.id} className="rounded-xl border border-black/10 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link to={'/profile/'+encodeURIComponent(post.username)} className="text-[13px] font-black">{post.owner_full_name||post.username}</Link>
        <span className="text-[10px] text-black/40">{new Date(post.created_at).toLocaleDateString('en-NG')}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-black/70">{post.body||'New work from Talent'}</p>
      <p className="mt-2 text-[11px] text-black/45">❤ {post.likes} · {post.comments} comments</p>
    </article>):<div className="grid h-full place-items-center rounded-xl bg-white p-6 text-[13px] text-black/55">Public Talent updates will appear here when shared.</div>}
  </div>
}
export default function Landing(){
  const [active,setActive]=useState(0),[previous,setPrevious]=useState(null),[paused,setPaused]=useState(false)
  const [data,setData]=useState({showroom:[],bento:[],vibes:[]}),[gate,setGate]=useState(null)
  const transition=useRef(null)
  const move=useCallback(next=>{
    setActive(now=>{
      const target=(next+MODES.length)%MODES.length
      if(now===target)return now
      setPrevious(now)
      return target
    })
  },[])
  useEffect(()=>{
    if(previous===null)return undefined
    clearTimeout(transition.current)
    transition.current=setTimeout(()=>setPrevious(null),650)
    return()=>clearTimeout(transition.current)
  },[previous,active])
  useEffect(()=>{
    if(paused)return undefined
    const timer=setInterval(()=>move(active+1),5800)
    return()=>clearInterval(timer)
  },[active,paused,move])
  useEffect(()=>{
    let cancelled=false
    Promise.allSettled(MODES.map(mode=>api.getGuestDiscovery({mode}))).then(results=>{
      if(cancelled)return
      const values={}
      MODES.forEach((mode,i)=>{values[mode]=results[i].status==='fulfilled'?(mode==='vibes'?results[i].value.posts||[]:results[i].value.hats||[]):[]})
      setData(values)
    })
    return()=>{cancelled=true;clearTimeout(transition.current)}
  },[])
  return <div className="ct-landing min-h-screen text-black">
    <main className="ct-landing-main relative mx-auto max-w-[1120px] px-4 pb-20 pt-7 sm:px-6 sm:pt-10">
      <div className="ct-landing-brand mb-12 flex items-center justify-between gap-3 sm:mb-16">
        <Link to="/" aria-label="ChombuTar home" className="flex items-center gap-3"><img src="/logo.png" alt="" className="h-11 w-11 rounded-full object-cover sm:h-12 sm:w-12"/><span className="text-[19px] font-black tracking-tight">Chombu<span className="text-[#0A13E6]">Tar</span></span></Link>
        <span className="ct-landing-brand-tag"><span className="ct-live-dot"/>Made for real talent</span>
      </div>
      <section aria-label="What Chombotar is" className="ct-landing-hero mb-12 text-center sm:mb-16">
        <p className="ct-hero-eyebrow"><Sparkles size={14} aria-hidden="true"/> A new way to discover talent</p>
        <h1 className="ct-hero-title">What is <span>Chombotar?</span></h1>
        <p className="ct-hero-copy mx-auto mt-5 max-w-[690px] text-[15px] leading-7 sm:text-[19px] sm:leading-8">A platform where Talents are showcased, discovered, kept up with, sponsored, hired and collaborated with.</p>
      </section>
      <section aria-label="Discover ChombuTar" className="ct-landing-discovery space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ct-location-label"><Compass size={15} aria-hidden="true"/> Across Nigeria <span>·</span> Trending by latest Orbit score</p>
          <p className="ct-trust-label"><ShieldCheck size={14} aria-hidden="true"/> Public, moderated previews</p>
        </div>
        <div className="ct-landing-stage-shell overflow-hidden rounded-[28px] p-3 sm:p-5">
          <div className="ct-stage-top mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="ct-stage-index">0{active+1} / 03</span><span className="ct-stage-name truncate">{PANEL_NAMES[active]}</span></div>
            <div className="flex gap-2">
              <button type="button" aria-label="Previous panel" className="ct-guest-stage-control" onClick={()=>move(active-1)}><ArrowLeft size={18}/></button>
              <button type="button" aria-label={paused?'Play panels':'Pause panels'} aria-pressed={paused} className="ct-guest-stage-control" onClick={()=>setPaused(p=>!p)}>
                {paused?<Play size={17}/>:<Pause size={17}/>}</button>
              <button type="button" aria-label="Next panel" className="ct-guest-stage-control" onClick={()=>move(active+1)}><ArrowRight size={18}/></button>
            </div>
          </div>
          <div className="ct-guest-stage relative h-[420px] overflow-hidden sm:h-[490px]" aria-live="off">
            {previous!==null&&<div key={'old-'+previous} aria-hidden="true" className="ct-guest-slide ct-guest-slide-out"><LandingPanel mode={MODES[previous]} data={data} onKeepUp={setGate}/></div>}
            <div key={'new-'+active} className={'ct-guest-slide '+(previous!==null?'ct-guest-slide-in':'')}>
              <LandingPanel mode={MODES[active]} data={data} onKeepUp={setGate}/>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2" aria-label="Landing stage panels">
            {MODES.map((mode,i)=><button type="button" key={mode} aria-label={'Show '+PANEL_NAMES[i]} aria-pressed={active===i}
              onClick={()=>move(i)} className={'h-2.5 rounded-full transition-all '+(active===i?'w-8 bg-[#0A13E6]':'w-2.5 bg-[#0A13E6]/20')}/>)}
          </div>
        </div>
        <p className="ct-panel-caption pt-2 text-center text-[13px] font-medium">{CAPTIONS[active]}</p>
      </section>
      <section aria-label="Get started" className="ct-landing-cta mt-12 flex flex-col items-center gap-3 text-center sm:mt-14">
        <p className="ct-cta-kicker">Your next discovery starts here</p>
        <Link to="/showroom" className="ct-enter-button inline-flex min-h-[60px] w-full max-w-[350px] items-center justify-center gap-3 rounded-full px-8 text-[17px] font-black">Enter Showroom <ArrowRight size={20}/></Link>
        <p className="ct-cta-note">Explore freely. Sign up only when you are ready to connect.</p>
        <Link to="/auth?mode=signup" className="ct-auth-link mt-1 text-[13px] font-bold underline underline-offset-4">Sign Up / Log In</Link>
      </section>
    </main>
    <GuestActionGate intent={gate} onClose={()=>setGate(null)}/>
  </div>
}
