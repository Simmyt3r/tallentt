import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api.js'

// Admin sees public state only. Private keys never enter React or client JSON.
export default function AdminWorkPassSigning() {
  const [status,setStatus]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function refresh() {
    setLoading(true);setError('')
    try{setStatus(await api.getAdminWorkPassSigning())}
    catch(err){setError(err.message||'Could not check signing status.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  async function activate(){
    if(busy)return
    setBusy('activate');setError('');setNotice('')
    try{
      await api.activateAdminWorkPassSigning()
      setNotice('Signing is active. All newly issued Work Pass QR codes are digitally signed.')
      await refresh()
    }catch(err){setError(err.message||'Could not enable signing.')}
    finally{setBusy('')}
  }
  async function rotate(){
    if(busy)return
    if(!window.confirm('Generate a new signing key? Existing Work Pass QR codes remain verifiable with retained public keys until they expire (7 days).'))return
    setBusy('rotate');setError('');setNotice('')
    try{
      await api.rotateAdminWorkPassSigning()
      setNotice('Signing key rotated. Older public verification keys remain available temporarily.')
      await refresh()
    }catch(err){setError(err.message||'Key rotation failed.')}
    finally{setBusy('')}
  }
  return <div className="space-y-4 p-4 md:p-6" aria-label="Work Pass signing settings">
    <div>
      <div className="flex items-center gap-2"><KeyRound size={19}/><h3 className="text-base font-black">Work Pass QR signing</h3></div>
      <p className="mt-2 max-w-xl text-xs text-black/60">Activate digital Work Pass signatures in one click. No key files or Vercel setup. ChombuTar generates and encrypts the key privately on the server.</p>
    </div>
    <div className="rounded-2xl border border-black/10 bg-[#F7F3EB] p-4">
      <div className="flex items-center gap-2">
        {status?.enabled?<CheckCircle2 size={19} className="text-green-700"/>:<KeyRound size={19} className="text-amber-700"/>}
        <strong className="text-sm">{loading?'Checking…':status?.enabled?'Signing active':'Signing not activated'}</strong>
      </div>
      {status?.keyId&&<p className="mt-2 break-all font-mono text-xs text-black/60">Key ID: {status.keyId}</p>}
      {status?.createdAt&&<p className="mt-1 text-xs text-black/50">Activated: {new Date(status.createdAt).toLocaleString()}</p>}
      {status?.source==='environment'&&<p className="mt-2 text-xs text-amber-800">Signing currently uses a deployment-managed key. Activate Admin-managed storage below to switch.</p>}
      {status?.source==='admin'&&<p className="mt-2 text-xs text-green-700">Encrypted on the server. {status.historicalKeys||0} previous public key(s) retained for verification.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {(!status?.enabled||status?.requiresSetup)&&<button type="button" disabled={loading||!!busy} onClick={activate}
          className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-xs font-black text-white disabled:opacity-40">
          {busy==='activate'?'Activating…':status?.enabled?'Switch to Admin-managed signing':'Activate signing'}
        </button>}
        {status?.source==='admin'&&<button type="button" disabled={loading||!!busy} onClick={rotate}
          className="min-h-11 rounded-full border border-black/20 px-4 text-xs font-bold disabled:opacity-40">
          {busy==='rotate'?'Rotating…':'Rotate signing key'}
        </button>}
        <button type="button" disabled={loading||!!busy} onClick={refresh}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-black/20 px-4 text-xs font-semibold disabled:opacity-40">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">{notice}</p>}
    <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
      <AlertTriangle size={15} className="mr-2 inline"/> <strong>Security:</strong> The encrypted key depends on the existing server authentication secret. Keep it stable and back up the database. Rotating that secret without re-encrypting the stored key will prevent new signatures. The Activate button prepares key storage automatically.
    </p>
  </div>
}
