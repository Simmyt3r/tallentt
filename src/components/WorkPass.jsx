import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, BriefcaseBusiness, CircleHelp, Crown, Download, ExternalLink, Fingerprint, Image as ImageIcon, Orbit, ScanQrCode, Share2, ShieldCheck, Users, UserRound, X } from 'lucide-react'
import QRCode from 'qrcode'
import WorkPassRobots from './WorkPassRobots.jsx'
import ProfilePhotoViewer from './ProfilePhotoViewer.jsx'
import { api } from '../lib/api.js'
import { cldImage } from '../lib/cloudinary.js'
import { useAuth } from '../context/AuthContext.jsx'
import { renderWorkPassStory } from '../lib/workPassArtwork.js'
import { workPassAccent, WORK_PASS_DISCLAIMER } from '../../shared/workPass.js'
import '../styles/work-pass.css'

const nameOf = user => user?.name || user?.username || 'ChombuTar member'
const roleOf = user => user?.headline || (user?.role === 'client' ? 'Client / Hiring professional' : 'Talent / Professional')

function Brand({ caption = 'DIGITAL WORK IDENTITY' }) {
  return <div className="flex min-w-0 items-center gap-2.5">
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[15px] border border-white/30 bg-white shadow-lg">
      <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain"/>
    </span>
    <span className="min-w-0"><span className="block text-[20px] font-black leading-none tracking-[-.05em]">ChombuTar</span>
      <span className="mt-1.5 block text-[8px] font-extrabold uppercase tracking-[.27em] text-white/70">{caption}</span></span>
  </div>
}
function OrbitArtwork() {
  return <svg aria-hidden="true" className="pointer-events-none absolute -right-16 top-7 h-[240px] w-[65%] opacity-70 sm:-right-5" viewBox="0 0 420 300" fill="none">
    <defs><linearGradient id="work-pass-orbit-gradient" x1="12" y1="40" x2="416" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".03"/><stop offset=".5" stopColor="#DEE6FF" stopOpacity=".8"/><stop offset="1" stopColor="#9FACFF" stopOpacity=".22"/></linearGradient></defs>
    <circle cx="248" cy="151" r="101" stroke="url(#work-pass-orbit-gradient)" strokeWidth="1.3"/>
    <circle cx="248" cy="151" r="71" stroke="url(#work-pass-orbit-gradient)" strokeOpacity=".8"/>
    <ellipse cx="248" cy="151" rx="190" ry="49" transform="rotate(-30 248 151)" stroke="url(#work-pass-orbit-gradient)" strokeWidth="2.8"/>
    <ellipse cx="248" cy="151" rx="159" ry="99" transform="rotate(31 248 151)" stroke="url(#work-pass-orbit-gradient)" strokeOpacity=".7"/>
    <path d="M240 97l9 28 28 9-28 9-9 28-9-28-28-9 28-9 9-28Z" fill="#DEE6FF" fillOpacity=".6"/>
    <path d="m344 23 6 18 18 6-18 6-6 18-6-18-18-6 18-6 6-18Z" fill="#fff" fillOpacity=".8"/>
    <circle cx="115" cy="212" r="6" fill="#DCE5FF"/>
  </svg>
}
function Stat({icon:Icon,title,value,unit,detail}) {
  return <div className="rounded-2xl border border-[#DBDFFA] bg-[#F7F3EB] p-3 sm:p-4">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#E5E8FF] text-[#0A13E6]"><Icon size={18}/></span>
    <div className="mt-3 text-[10px] font-bold leading-tight text-[#5D647B] sm:text-[11px]">{title}</div>
    <div className="mt-1 break-words text-[24px] font-black leading-none tracking-[-.05em] text-[#111739] sm:text-[30px]">{value}<span className="ml-1 text-[10px] font-semibold tracking-normal text-[#70788E]">{unit}</span></div>
    <div className="mt-1 text-[9px] text-[#757B8C]">{detail}</div>
  </div>
}
export default function WorkPass({username,onClose,compact=false}) {
  const {user: signedIn}=useAuth()
  const [data,setData]=useState(null)
  const [qr,setQr]=useState('')
  const [busy,setBusy]=useState(true)
  const [exporting,setExporting]=useState(false)
  const [photoOpen,setPhotoOpen]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    let active=true
    setData(null);setQr('');setBusy(true);setError('');setNotice('')
    api.getWorkPass(username).then(async pass=>{
      if(!active)return
      setData(pass)
      if(pass.token){
        const image=await QRCode.toDataURL(pass.token,{width:400,margin:2,errorCorrectionLevel:'M'})
        if(active)setQr(image)
      }
    }).catch(err=>{if(active)setError(err.message||'Could not load Work Pass.')})
      .finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[username])
  const owner=data?.user
  const isOwner=!!(signedIn?.username && owner?.username && signedIn.username.toLowerCase()===owner.username.toLowerCase())
  const signed=!!(qr && data?.signatureStatus==='signed')
  const accent=workPassAccent(data?.tier)
  const avatar=owner?.avatarUrl?cldImage(owner.avatarUrl,{w:500,h:500}):''
  async function share(){
    const url=window.location.origin+'/profile/'+encodeURIComponent(owner?.username||username)
    setNotice('')
    try{
      if(navigator.share)await navigator.share({title:nameOf(owner)+' · ChombuTar Work Pass',url})
      else{await navigator.clipboard.writeText(url);setNotice('Profile link copied.')}
    }catch(err){if(err.name!=='AbortError')setError('Could not share this Work Pass.')}
  }
  async function flex(){
    if(exporting||!data)return
    setExporting(true);setError('');setNotice('')
    try{
      const blob=await renderWorkPassStory({pass:data,qr,avatarUrl:avatar})
      const uri=URL.createObjectURL(blob)
      const anchor=document.createElement('a')
      anchor.href=uri;anchor.download='chombutar-work-pass-'+(owner?.username||'member')+'.png'
      document.body.appendChild(anchor);anchor.click();anchor.remove()
      setTimeout(()=>URL.revokeObjectURL(uri),30000)
      setNotice('Work Pass graphic created. Share it on WhatsApp or Instagram.')
    }catch(err){setError(err.message||'Could not create your Work Pass graphic.')}
    finally{setExporting(false)}
  }
  return <section className="w-full max-w-[710px] mx-auto" aria-label="Work Pass">
    {busy&&<div role="status" className="rounded-[26px] border border-[#DCE1F6] bg-white p-10 text-center text-[13px] font-medium text-[#505879]">Preparing your ChombuTar Work Pass…</div>}
    {error&&<p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {data&&<div className="workpass-sheet overflow-hidden rounded-[26px] border-[1.5px] border-black/10 bg-white shadow-[0_20px_60px_-30px_rgba(10,19,230,.45)]">
      <div className="workpass-hero relative isolate overflow-hidden px-4 pb-5 pt-5 text-white sm:px-7 sm:pb-6 sm:pt-6" style={{'--workpass-accent':accent}}>
        <OrbitArtwork/>
        <div className="relative z-10 flex items-center justify-between gap-2">
          <Brand caption="WORK PASS · REAL WORK"/>
          {onClose?<button type="button" onClick={onClose} aria-label="Close Work Pass" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 hover:bg-white/25"><X size={18}/></button>
            :<span className="flex shrink-0 items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider"><Fingerprint size={12}/> Digital ID</span>}
        </div>
        <div className="relative z-10 mt-8 flex min-w-0 items-center gap-4 sm:mt-10 sm:gap-6">
          {avatar?<button type="button" aria-label={'View '+nameOf(owner)+' full profile photo'}
            onClick={()=>setPhotoOpen(true)} title="View full profile picture"
            className="group relative h-[102px] w-[102px] shrink-0 cursor-zoom-in rounded-full border-[3px] p-[4px] shadow-[0_0_0_5px_rgba(255,255,255,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-[129px] sm:w-[129px]"
            style={{borderColor:accent}}>
            <img src={avatar} alt={nameOf(owner)+' profile photograph'} className="h-full w-full rounded-full bg-white object-cover"/>
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-[11px] font-black text-transparent transition-colors group-hover:bg-black/45 group-hover:text-white">View photo</span>
          </button>:<div className="h-[102px] w-[102px] shrink-0 rounded-full border-[3px] p-[4px] shadow-[0_0_0_5px_rgba(255,255,255,.08)] sm:h-[129px] sm:w-[129px]" style={{borderColor:accent}}>
            <span className="grid h-full w-full place-items-center rounded-full bg-[#F7F3EB] text-[36px] font-black text-[#0A13E6]">{nameOf(owner).slice(0,1).toUpperCase()}</span>
          </div>}
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#151727]" style={{backgroundColor:accent}}><Crown size={12}/>{data.tier} Work Pass</span>
            <h2 className="mt-3 break-words text-[22px] font-black leading-[1.08] tracking-[-.05em] sm:text-[30px]">{nameOf(owner)}</h2>
            <p className="mt-1 break-all text-xs font-semibold text-[#D8E1FF]">@{owner?.username}</p>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold leading-snug text-white sm:text-[12px]"><BriefcaseBusiness size={13} className="mt-[1px] shrink-0"/>{owner?.role==='dual'?'Talent & Client · One Work Pass':roleOf(owner)}</p>
            {!!owner?.headline && !!owner?.skills?.length && <p className="mt-1 line-clamp-2 text-[10px] text-white/80">{owner.skills.slice(0,3).join(' · ')}</p>}
          </div>
        </div>
        <div className="relative z-10 mt-9 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold sm:mt-11">
          <span className="flex items-center gap-2"><span className={'h-2 w-2 rounded-full '+(signed?'bg-emerald-300':'bg-amber-300')}/>{signed?'Digitally signed by ChombuTar':'Unsigned profile preview'}</span>
          <span className="text-white/75 tracking-widest">WORK · TRUST · GROW</span>
        </div>
      </div>
      <div className="space-y-5 bg-gradient-to-b from-white to-[#FDFBF8] p-4 sm:p-6">
        <section aria-label="Separate talent and client Orbit scores" className="rounded-2xl border border-[#DCE0FF] bg-[#F1F3FF] p-3 sm:p-4">
          <h3 className="text-[13px] font-black text-[#111837]">Your Work Pass · Two independent roles</h3>
          <p className="mt-1 text-[10px] text-[#5D647B]">One identity and signed QR. Talent work and client hiring scores are calculated separately. Paid, confirmed salary months appear only when both participants pay tracking fees.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#D6DCFC] bg-white p-3">
              <p className="text-[11px] font-black text-[#0A13E6]">Talent Orbit</p>
              <p className="mt-1 text-2xl font-black text-[#111837]">{data.roleOrbit?.talent?.score??0}<span className="text-xs text-[#6B738E]"> / 100</span></p>
              <p className="mt-2 text-[10px] text-[#626B82]">{data.completedJobs||0} completed jobs · {data.paidTrackingMonths?.talent||0} paid-confirmed salary months</p>
            </div>
            <div className="rounded-xl border border-[#D6DCFC] bg-white p-3">
              <p className="text-[11px] font-black text-[#0A13E6]">Client Orbit</p>
              <p className="mt-1 text-2xl font-black text-[#111837]">{data.roleOrbit?.client?.score??0}<span className="text-xs text-[#6B738E]"> / 100</span></p>
              <p className="mt-2 text-[10px] text-[#626B82]">{data.successfulHires||0} successful hires · {data.paidTrackingMonths?.client||0} paid-confirmed salary months</p>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-3 gap-2.5" aria-label="Work Pass statistics">
          <Stat icon={Orbit} title="Orbit Score" value={Number(data.orbit)||0} unit="/100" detail="Activity score"/>
          <Stat icon={BriefcaseBusiness} title="Completed Jobs" value={Number(data.completedJobs)||0} detail="Released deals"/>
          <Stat icon={Users} title="Successful Hires" value={Number(data.successfulHires)||0} detail="Released deals"/>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[#DDE1FD] bg-[#F1F3FF] p-3 sm:p-4">
          <div className="flex min-w-0 gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0A13E6]">{signed?<BadgeCheck size={20}/>:<CircleHelp size={20}/>}</span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-black text-[#111837]">{signed?'Signed Work Pass':'Signature not activated'}</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-[#565F7D]">{signed?'Digitally signed by ChombuTar. Scan to verify this work record.':'The Admin team must activate Work Pass signing before a trusted QR is issued.'}</p>
              {signed&&<Link to="/work-pass/verify" onClick={onClose} className="mt-2 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0A13E6] hover:underline"><ScanQrCode size={13}/> Verify signature</Link>}
            </div>
          </div>
          <div className="grid h-[94px] w-[94px] shrink-0 place-items-center rounded-[14px] border border-[#D8DFF9] bg-white p-1.5 sm:h-[110px] sm:w-[110px]">
            {signed?<img src={qr} alt={'Signed Work Pass QR for '+nameOf(owner)} className="h-full w-full object-contain"/>:
              <div className="text-center text-[9px] font-medium text-[#777F9A]"><ScanQrCode size={26} className="mx-auto mb-1 opacity-50"/>QR pending</div>}
          </div>
        </div>
        <section aria-label="Completed work evidence">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[14px] font-black tracking-tight text-[#131831]">Recent work evidence</h3>
            <span className="text-[10px] font-extrabold text-[#0A13E6]">{data.evidence?.length||0} customer-approved</span>
          </div>
          {data.evidence?.length?<div className="mt-3 grid grid-cols-3 gap-2.5">{data.evidence.slice(0,6).map((item,i)=>
            <a key={item.id} href={item.image_url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-[1.08] overflow-hidden rounded-[13px] border border-black/10 bg-[#F7F3EB]" aria-label={'View approved work evidence '+(i+1)}>
              <img src={cldImage(item.image_url,{w:400,h:380})} loading="lazy" alt={'Customer-approved work '+(i+1)} className="h-full w-full object-cover transition-transform group-hover:scale-105"/>
              <span className="absolute bottom-2 left-2 grid h-6 w-6 place-items-center rounded-lg bg-[#081139]/80 text-white"><ExternalLink size={13}/></span>
            </a>)}</div>:
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-[#D3D8F0] bg-[#F7F3EB] p-3 text-[11px] text-[#677087]"><ImageIcon size={18} className="shrink-0"/>Customer-approved job photos will appear here after completed work.</p>}
        </section>
        {!!owner?.skills?.length&&<section aria-label="Skills and capabilities">
          <h3 className="text-[13px] font-black text-[#171D39]">Skills & capabilities</h3>
          <div className="mt-2 flex flex-wrap gap-2">{owner.skills.slice(0,6).map((skill,i)=><span key={i} className="rounded-full border border-[#DCE0FB] bg-[#EEF0FF] px-3 py-1.5 text-[10px] font-bold text-[#27318F]">{skill}</span>)}</div>
        </section>}
        {!!data.endorsements?.length&&<section><h3 className="text-[13px] font-black text-[#171D39]">Approved endorsements</h3>
          {data.endorsements.map((item,i)=><p key={i} className="mt-2 text-[11px] text-[#535E7D]"><ShieldCheck size={13} className="mr-1 inline text-[#0A13E6]"/>{item.issuer} · {item.statement}</p>)}</section>}
        <p className="border-t border-black/10 pt-3 text-[10px] leading-relaxed text-[#767D8E]">{data.disclaimer||WORK_PASS_DISCLAIMER}</p>
      </div>
    </div>}
    {data&&isOwner&&compact&&owner?.role!=='client'&&<WorkPassRobots robots={data.robots||[]} onCreated={robot=>setData(current=>({...current,robots:[robot,...(current.robots||[])]}))}/>}
    {data&&<div className="workpass-actions mt-3 flex flex-wrap gap-2" aria-label="Work Pass actions">
      <button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0A13E6] px-4 text-[11px] font-black text-white hover:bg-[#080fb8]"><Share2 size={15}/> Share profile</button>
      <button type="button" onClick={flex} disabled={exporting} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 text-[11px] font-bold text-[#17203C] disabled:opacity-60"><Download size={15}/>{exporting?'Creating story…':'Flex My Work Pass'}</button>
      <Link to={'/profile/'+encodeURIComponent(owner?.username||username)} onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 text-[11px] font-bold"><UserRound size={15}/> View profile</Link>
      {isOwner&&<><Link to="/settings" onClick={onClose} className="inline-flex min-h-10 items-center rounded-full border border-black/15 bg-white px-4 text-[11px] font-bold">Settings</Link><Link to="/wallet" onClick={onClose} className="inline-flex min-h-10 items-center rounded-full border border-black/15 bg-white px-4 text-[11px] font-bold">Money</Link></>}
      <button type="button" onClick={()=>window.print()} className="inline-flex min-h-10 items-center rounded-full border border-black/15 bg-white px-4 text-[11px] font-bold">Print card</button>
    </div>}
    {notice&&<p role="status" className="mt-2 text-xs font-semibold text-[#0A13E6]">{notice}</p>}
    {photoOpen&&owner?.avatarUrl&&<ProfilePhotoViewer src={owner.avatarUrl} name={nameOf(owner)} onClose={()=>setPhotoOpen(false)}/>}
  </section>
}
