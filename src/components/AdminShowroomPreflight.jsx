import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api.js'

export default function AdminShowroomPreflight() {
  const [status,setStatus] = useState(null)
  const [loading,setLoading] = useState(true)
  const [checking,setChecking] = useState(false)
  const [error,setError] = useState('')
  const [cloudinary,setCloudinary] = useState(null)

  const refresh=useCallback(async()=>{
    setLoading(true)
    try {
      setStatus(await api.getAdminShowroomPreflight())
      setError('')
    } catch(err){setError(err.message || 'Deployment checks are unavailable.')}
    finally {setLoading(false)}
  },[])
  useEffect(()=>{refresh()},[refresh])

  async function checkCloudinary(){
    if(checking)return
    setChecking(true)
    setCloudinary(null)
    setError('')
    try {setCloudinary(await api.testAdminShowroomCloudinary())}
    catch(err){setError(err.message || 'Cloudinary Admin API test failed.')}
    finally {setChecking(false)}
  }

  return <section aria-label="Showroom deployment preflight" className="space-y-4 rounded-2xl border border-black/15 p-4">
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h4 className="flex items-center gap-2 text-[14px] font-black"><ShieldCheck size={18}/> Deployment readiness</h4>
        <p className="mt-1 max-w-xl text-[12px] text-black/60">
          Verify schema and server configuration before enabling media security.
          These checks never change migrations or reveal credentials.
        </p>
      </div>
      <button type="button" disabled={loading} onClick={refresh}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-black px-4 text-[11px] font-bold disabled:opacity-40">
        <RefreshCw size={14}/>{loading?'Checking…':'Refresh checks'}
      </button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-semibold text-red-700">{error}</p>}
    {status && <>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold">
        <span className={`rounded-full px-3 py-2 ${status.readyToDeploy?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>
          {status.readyToDeploy?'Database checks passed':'Setup incomplete'}
        </span>
        <span className="rounded-full bg-[#F7F3EB] px-3 py-2">
          Encryption root: {status.encryptionRootConfigured?'Configured':'Missing'}
        </span>
        <span className="rounded-full bg-[#F7F3EB] px-3 py-2">
          Signed uploads: {status.signedUploads.enabled?'Enforced':'Off'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(status.migrations||[]).map(item=><div key={item.key}
          className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-[11px] font-semibold">
          {item.ready?<CheckCircle2 size={15} className="shrink-0 text-emerald-700"/>:
            <AlertCircle size={15} className="shrink-0 text-amber-700"/>}
          <span>{item.label}</span>
          <span className="ml-auto text-[10px] text-black/45">{item.ready?'Ready':'Missing'}</span>
        </div>)}
      </div>
      <div className="space-y-2 rounded-xl bg-[#F7F3EB] p-3">
        <p className="text-[12px] font-bold">Cloudinary provider validation</p>
        <p className="text-[11px] text-black/55">
          Server credentials: {status.signedUploads.credentialsConfigured?'Present':'Missing'} ·
          Server cloud: {status.signedUploads.cloudName||'Not set'}.
          A successful connection test confirms actual Cloudinary Admin API access.
        </p>
        <button type="button" onClick={checkCloudinary}
          disabled={checking||!status.signedUploads.credentialsConfigured}
          className="h-10 rounded-full bg-black px-4 text-[11px] font-bold text-white disabled:opacity-40">
          {checking?'Testing Cloudinary…':'Test Cloudinary connection'}
        </button>
        {cloudinary?.ok && <p role="status" className="text-[11px] font-bold text-emerald-800">
          Cloudinary Admin API reachable at {new Date(cloudinary.validatedAt).toLocaleString()}.
        </p>}
        <p className="text-[10px] text-black/50">
          The test reads only a one-item metadata page, not media contents.
          It may consume Cloudinary Admin API quota.
        </p>
      </div>
      <p className="text-[11px] text-black/55">
        Automated worker setup still requires GitHub Actions secrets and the repository enable flag.
        Provider access tests do not replace a complete signed-upload and moderation smoke test.
      </p>
    </>}
  </section>
}
