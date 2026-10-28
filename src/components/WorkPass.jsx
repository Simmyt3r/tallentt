import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Share2, X } from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '../lib/api.js'
import { workPassAccent, WORK_PASS_DISCLAIMER } from '../../shared/workPass.js'

// Public cards do not claim identity verification when a signing key or
// approved job evidence is absent. The QR is a signed claim only when configured.
export default function WorkPass({ username, onClose, compact = false }) {
  const [data,setData]=useState(null)
  const [qr,setQr]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(true)
  useEffect(()=>{
    let active=true
    setBusy(true);setError('');setQr('')
    api.getWorkPass(username).then(async result=>{
      if(!active)return
      setData(result)
      if(result.token) {
        const image=await QRCode.toDataURL(result.token,{width:256,margin:1})
        if(active)setQr(image)
      }
    }).catch(err=>{if(active)setError(err.message||'Work Pass unavailable.')})
      .finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[username])
  async function share() {
    const url=window.location.origin+'/profile/'+encodeURIComponent(username)
    if(navigator.share){try{await navigator.share({title:'Chombutar Work Pass',url})}catch{}}
    else await navigator.clipboard.writeText(url).catch(()=>setError('Could not copy link.'))
  }
  function flex() {
    if(!data)return
    // Story image can be downloaded without a server-side image renderer.
    const canvas=document.createElement('canvas')
    canvas.width=1080;canvas.height=1920
    const ctx=canvas.getContext('2d')
    ctx.fillStyle='#F7F3EB';ctx.fillRect(0,0,1080,1920)
    ctx.fillStyle=workPassAccent(data.tier);ctx.fillRect(0,0,1080,32)
    ctx.textAlign='center';ctx.fillStyle='#15212A';ctx.font='bold 64px sans-serif'
    ctx.fillText('CHOMBUTAR WORK PASS',540,260)
    ctx.font='bold 82px sans-serif';ctx.fillText(data.user.name.slice(0,24),540,480)
    ctx.font='bold 54px sans-serif';ctx.fillText(data.tier+' · '+data.user.role,540,620)
    ctx.font='44px sans-serif';ctx.fillText(data.completedJobs+' completed jobs',540,720)
    ctx.fillText('Orbit '+data.orbit+'/100',540,790)
    if(qr) {const image=new Image();image.onload=()=>{ctx.drawImage(image,290,930,500,500);save()} ;image.src=qr}
    else save()
    function save(){
      ctx.font='30px sans-serif';ctx.fillStyle='#475569'
      ctx.fillText('Past results do not guarantee future work.',540,1600)
      const a=document.createElement('a')
      a.href=canvas.toDataURL('image/png');a.download='chombutar-work-pass.png';a.click()
    }
  }
  return <section aria-label="Work Pass" className={compact?'w-full':'w-full max-w-md'}>
    {onClose&&<button type="button" onClick={onClose} aria-label="Close Work Pass" className="ml-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/10"><X size={20}/></button>}
    {busy&&<p role="status" className="p-5 text-sm">Loading Work Pass…</p>}
    {error&&<p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
    {data&&<div className="overflow-hidden rounded-[25px] border-2 border-black/20 bg-white shadow-xl">
      <div className="h-3" style={{background:workPassAccent(data.tier)}}/>
      <div className="p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-black/50">Chombutar · Work Pass</p>
        <div className="mt-4 flex gap-4 items-center">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-[3px] bg-[#F7F3EB]" style={{borderColor:workPassAccent(data.tier)}}>
            {data.user.avatarUrl?<img src={data.user.avatarUrl} alt="" className="h-full w-full object-cover"/>:<div className="grid h-full w-full place-items-center text-3xl font-black">{data.user.name?.[0]}</div>}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black">{data.user.name}</h2>
            <p className="text-xs text-black/50">@{data.user.username}</p>
            <p className="mt-2 rounded-full px-3 py-1 text-xs font-black text-white" style={{background:workPassAccent(data.tier)}}>{data.tier} · {data.user.role}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-black/60">{(data.user.skills||[]).slice(0,4).join(' · ')||data.user.headline||'Professional profile'}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#F7F3EB] p-2"><strong className="block text-lg">{data.completedJobs}</strong><span className="text-[10px]">Jobs</span></div>
          <div className="rounded-xl bg-[#F7F3EB] p-2"><strong className="block text-lg">{data.orbit}%</strong><span className="text-[10px]">Orbit</span></div>
          <div className="rounded-xl bg-[#F7F3EB] p-2"><strong className="block text-lg">{data.rating==null?'—':data.rating}</strong><span className="text-[10px]">Stars</span></div>
        </div>
        {qr?<div className="mt-4 text-center"><img className="mx-auto h-44 w-44" alt="Signed Work Pass QR" src={qr}/><p className="text-[10px] text-green-700">Digitally signed · verification available with public key</p></div>
          :<p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Digital signature not configured. This is an unsigned profile preview, not a verified credential.</p>}
        <div className="mt-4">
          <h3 className="text-sm font-black">Customer-approved work</h3>
          {data.evidence.length?<div className="mt-2 grid grid-cols-3 gap-2">{data.evidence.map(item=><img key={item.id} src={item.image_url} alt="Approved completed job" className="aspect-square w-full rounded-xl object-cover"/>)}</div>:<p className="mt-1 text-xs text-black/45">No customer-approved photos yet.</p>}
        </div>
        {data.endorsements.length>0&&<div className="mt-3"><h3 className="text-xs font-black">Approved endorsements</h3>{data.endorsements.map((e,i)=><p key={i} className="text-xs">{e.issuer} · {e.statement}</p>)}</div>}
        <p className="mt-4 text-[10px] text-black/50">{data.disclaimer||WORK_PASS_DISCLAIMER}</p>
      </div>
    </div>}
    {data&&<div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={share} className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-2 text-xs font-bold text-white"><Share2 size={14}/> Share</button>
      <button type="button" onClick={flex} className="inline-flex items-center gap-1 rounded-full border border-black/20 px-3 py-2 text-xs font-bold"><Download size={14}/> Flex My Work Pass</button>
      <Link to="/profile" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-xs font-bold">Profile</Link>
      <Link to="/settings" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-xs font-bold">Settings</Link>
      <Link to="/wallet" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-xs font-bold">Money</Link>
      <Link to="/work-pass/verify" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-xs font-bold">Verify QR</Link>
      <button type="button" onClick={()=>window.print()} className="rounded-full border border-black/20 px-3 py-2 text-xs font-bold">Print card</button>
    </div>}
  </section>
}
