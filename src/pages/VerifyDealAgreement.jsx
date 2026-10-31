import {useEffect,useState} from 'react'
import {ShieldCheck,ShieldX} from 'lucide-react'
import {Link,useSearchParams} from 'react-router-dom'
import {api} from '../lib/api.js'

export default function VerifyDealAgreement(){
  const [params]=useSearchParams()
  const token=params.get('token')||''
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true)
  useEffect(()=>{
    let active=true
    setBusy(true);setResult(null);setError('')
    if(!token){setError('No agreement verification code provided.');setBusy(false);return()=>{}}
    api.verifyDealAgreement(token).then(data=>{if(active)setResult(data)})
      .catch(e=>{if(active)setError(e.message||'Verification failed.')})
      .finally(()=>{if(active)setBusy(false)})
    return()=>{active=false}
  },[token])
  return <main className="mx-auto max-w-xl space-y-4 py-8">
    <h1 className="text-xl font-black">Verify ChombuTar agreement</h1>
    {busy&&<p role="status" className="text-sm">Checking live transaction status…</p>}
    {error&&<section role="alert" className="rounded-xl border border-red-200 bg-white p-5">
      <ShieldX size={30} className="text-red-700"/>
      <h2 className="mt-2 text-base font-bold">Agreement could not be verified</h2>
      <p className="mt-2 text-sm text-red-700">{error}</p></section>}
    {result&&<section className="space-y-3 rounded-xl border border-black/10 bg-white p-5">
      <ShieldCheck size={30} className={result.gatePassEligible?'text-emerald-700':'text-amber-700'}/>
      <h2 className="text-base font-black">{result.gatePassEligible?'Verified active escrow':'Verified historical agreement'}</h2>
      <p className="text-xs text-black/55">{result.message}</p>
      <dl className="space-y-2 text-sm">
        <div><dt className="font-semibold">Service</dt><dd>{result.hatTitle}</dd></div>
        <div><dt className="font-semibold">Client</dt><dd>{result.clientName}</dd></div>
        <div><dt className="font-semibold">Talent</dt><dd>{result.talentName}</dd></div>
        <div><dt className="font-semibold">Current status</dt><dd className="capitalize">{String(result.status).replaceAll('_',' ')}</dd></div>
      </dl>
      <p className="border-t border-black/10 pt-3 text-[11px] text-black/60">Match the person presenting this pass with the named talent and confirm the venue has authorized access. A valid QR does not replace site security checks.</p>
    </section>}
    <Link to="/showroom" className="inline-flex min-h-11 items-center text-xs font-bold text-[#0A13E6]">Back to ChombuTar</Link>
  </main>
}
