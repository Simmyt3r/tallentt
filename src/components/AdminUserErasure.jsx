import {useEffect,useState} from 'react'
import {AlertTriangle,ShieldAlert,Trash2,X,RefreshCcw} from 'lucide-react'
import {api} from '../lib/api.js'

export default function AdminUserErasure({user,onClose,onDeleted}){
  const [preview,setPreview]=useState(null)
  const [confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [complete,setComplete]=useState(null)

  useEffect(()=>{
    if(!user?.id)return undefined
    let active=true
    api.getUserErasurePreview(user.id).then(data=>{
      if(active){setPreview(data);setError('')}
    }).catch(err=>{
      if(active)setError(err.message||'Could not check this subscriber.')
    }).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[user?.id])

  useEffect(()=>{
    function keyDown(event){if(event.key==='Escape'&&!busy)onClose()}
    document.addEventListener('keydown',keyDown)
    return ()=>document.removeEventListener('keydown',keyDown)
  },[onClose,busy])

  if(!user)return null
  const expected=preview?`DELETE @${preview.user.username}`:''
  async function run(){
    if(busy||!preview?.eligible||confirmation!==expected)return
    setBusy(true);setError('')
    try{
      const result=await api.eraseSubscriber(user.id,confirmation)
      setComplete(result)
      await onDeleted?.()
    }catch(err){
      setError(err.message||'Deletion could not be completed. Nothing was changed.')
    }finally{setBusy(false)}
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-8"
    role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="erase-account-title"
      className="my-auto w-full max-w-[560px] space-y-4 rounded-2xl border border-black/10 bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 id="erase-account-title" className="flex items-center gap-2 text-[17px] font-black"><ShieldAlert className="text-red-700" size={21}/> Delete subscriber and data</h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close account deletion"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/10 disabled:opacity-40"><X size={17}/></button>
      </div>
      <div className="rounded-xl bg-[#F7F3EB] p-3">
        <p className="text-[13px] font-bold">@{user.username}</p>
        <p className="mt-1 text-[11px] text-black/60">{user.full_name||user.fullName||''} · {user.email||''}</p>
      </div>
      {loading&&<p role="status" className="text-[12px] text-black/60">Checking the subscriber's data and financial dependencies…</p>}
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
      {preview&&!complete&&<>
        <p className="text-[12px] text-black/70">This action permanently removes an eligible account, including its Hats, posts, applications, notifications, profile and other linked database records. It cannot be undone.</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/10 p-3 text-[12px]">
          <span>Hats: <strong>{preview.related.hats}</strong></span>
          <span>Social posts: <strong>{preview.related.social_posts}</strong></span>
          <span>Notifications: <strong>{preview.related.notifications}</strong></span>
          <span>Escrows: <strong>{preview.related.escrow_records}</strong></span>
          <span>Wallet entries: <strong>{preview.related.wallet_transactions}</strong></span>
          <span>Live financial records: <strong>{preview.related.live_financial_events}</strong></span>
        </div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-950">
          <AlertTriangle className="mr-1 inline-block" size={14}/>
          Financial and escrow records cannot be erased here. Uploaded files are queued for Cloudinary deletion after the database transaction. The queue can be retried separately if storage is unavailable.
        </p>
        {!preview.eligible?(
          <section className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-[12px] font-black text-red-800">Deletion blocked</p>
            {preview.reasons.map(item=><p key={item} className="text-[12px] text-red-800">• {item}</p>)}
            <p className="text-[11px] text-red-700">Resolve the dependencies through the proper financial or account process before retrying.</p>
          </section>
        ):(
          <div className="space-y-2">
            <label htmlFor="erase-subscriber-confirm" className="block text-[12px] font-bold">
              Type <code className="rounded bg-red-50 px-1 py-0.5">{expected}</code> to confirm
            </label>
            <input id="erase-subscriber-confirm" value={confirmation} autoComplete="off" spellCheck={false}
              onChange={event=>setConfirmation(event.target.value)}
              placeholder={expected} className="h-12 w-full rounded-xl border border-red-300 px-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-red-400"/>
          </div>
        )}
      </>}
      {complete&&<div role="status" className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-[12px] text-blue-900">
        <p className="font-bold">Database account deleted.</p>
        <p>Cloudinary items queued: {complete.media_jobs_created}.</p>
        <p>Items still awaiting cleanup: {complete.media_cleanup?.pending??'Check media queue'}.</p>
        {complete.legacy_media_needing_review > 0 && <p className="text-amber-900">Legacy media requiring ownership verification: {complete.legacy_media_needing_review}. Review these assets separately before deleting them.</p>}
        <p>The minimal administrator audit record is retained.</p>
      </div>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-black/10 pt-3">
        <button type="button" onClick={onClose} disabled={busy}
          className="min-h-11 rounded-full border border-black/20 px-5 text-[12px] font-bold disabled:opacity-40">{complete?'Close':'Cancel'}</button>
        {!complete&&preview?.eligible&&<button type="button" disabled={busy||confirmation!==expected} onClick={run}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-red-700 px-5 text-[12px] font-bold text-white disabled:opacity-40">
          <Trash2 size={15}/> {busy?'Deleting…':'Permanently delete'}
        </button>}
      </div>
    </section>
  </div>
}

export function AdminUserMediaCleanup(){
  const [status,setStatus]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const load=()=>api.getUserMediaErasureStatus().then(setStatus).catch(err=>setError(err.message||'Could not load media queue.'))
  useEffect(()=>{load()},[])
  async function retry(){
    if(busy)return
    setBusy(true);setError('')
    try{const result=await api.retryUserMediaErasure();setStatus(result)}
    catch(err){setError(err.message||'Cleanup retry failed.')}
    finally{setBusy(false)}
  }
  return <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-3" aria-label="Removed account media cleanup">
    <div>
      <h3 className="text-[12px] font-bold">Deleted-account media cleanup</h3>
      <p className="text-[11px] text-black/50">Pending Cloudinary items: {status?.pending??'Checking…'} · Failed attempts: {status?.failed??'–'}</p>
      {status?.warning&&<p className="mt-1 text-[11px] text-amber-800">{status.warning}</p>}
      {error&&<p role="alert" className="mt-1 text-[11px] text-red-700">{error}</p>}
    </div>
    <button type="button" onClick={retry} disabled={busy||!status?.pending}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/20 px-4 text-[12px] font-bold disabled:opacity-40">
      <RefreshCcw size={14}/>{busy?'Processing…':'Retry media cleanup'}
    </button>
  </section>
}
