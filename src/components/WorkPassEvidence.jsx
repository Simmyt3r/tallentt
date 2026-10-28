import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2 } from 'lucide-react'
import { api, uploadToCloudinary } from '../lib/api.js'

// Only completed, released deals are eligible. A live camera capture prevents
// ordinary gallery selection, but is not represented as hardware attestation.
export default function WorkPassEvidence({thread}){
  const [proof,setProof]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [status,setStatus]=useState('')
  const file=useRef(null)
  const isClient=thread.is_client
  useEffect(()=>{
    let mounted=true
    api.getDealWorkPassEvidence(thread.id).then(r=>{if(mounted)setProof(r.evidence)})
      .catch(e=>{if(mounted)setError(e.message)})
    return()=>{mounted=false}
  },[thread.id])
  async function capture(event){
    const photo=event.target.files?.[0]
    event.target.value=''
    if(!photo)return
    setBusy(true);setError('');setStatus('')
    try {
      if(!photo.type.startsWith('image/')||photo.size>8*1024*1024)throw Error('Use a photo under 8 MB.')
      const digest=await crypto.subtle.digest('SHA-256',await photo.arrayBuffer())
      const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
      const uploaded=await uploadToCloudinary(photo)
      if(!uploaded.upload_id)throw Error('Signed uploads are required for Work Pass evidence.')
      await api.workPassAction({action:'work_pass_submit_evidence',escrow_id:thread.id,
        upload_id:uploaded.upload_id,public_id:uploaded.public_id,url:uploaded.url,sha256})
      const result=await api.getDealWorkPassEvidence(thread.id)
      setProof(result.evidence);setStatus('Evidence submitted. The client must approve before publication.')
    }catch(e){setError(e.message||'Could not submit work evidence.')}
    finally{setBusy(false)}
  }
  async function review(decision){
    setBusy(true);setError('');setStatus('')
    try{
      await api.workPassAction({action:'work_pass_review_evidence',escrow_id:thread.id,decision})
      setProof(prev=>({...prev,status:decision}))
      setStatus(decision==='approved'?'Published to the worker’s Work Pass.':'Evidence rejected.')
    }catch(e){setError(e.message||'Could not review evidence.')}
    finally{setBusy(false)}
  }
  if(thread.status!=='released')return null
  return <section aria-label="Work Pass job evidence" className="rounded-[18px] border border-black/10 bg-white p-4">
    <h2 className="text-sm font-black">Verified work portfolio</h2>
    <p className="mt-1 text-xs text-black/50">One photo per completed deal. Customer approval is required before it appears on the public Work Pass.</p>
    {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {status&&<p role="status" className="mt-2 text-xs text-green-700">{status}</p>}
    {proof&&<div className="mt-3"><img src={proof.image_url} alt="Submitted work proof" className="max-h-60 rounded-xl object-contain"/>
      <p className="mt-2 text-xs font-semibold">Review: {proof.status}</p></div>}
    {!isClient&&(!proof||proof.status==='rejected')&&<div className="mt-3">
      <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={capture} aria-label="Capture completed work"/>
      <button type="button" disabled={busy} onClick={()=>file.current?.click()}
        className="inline-flex items-center gap-2 rounded-full bg-[#0A13E6] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
        <Camera size={16}/>{busy?'Submitting…':'Capture completed work'}</button>
    </div>}
    {isClient&&proof?.status==='pending'&&<div className="mt-3 flex gap-2">
      <button type="button" disabled={busy} onClick={()=>review('approved')} className="rounded-full bg-[#0A13E6] px-4 py-2 text-xs font-bold text-white">Approve photo</button>
      <button type="button" disabled={busy} onClick={()=>review('rejected')} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700">Reject photo</button>
    </div>}
  </section>
}
