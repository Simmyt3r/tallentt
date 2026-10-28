import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { verifyWorkPassToken } from '../lib/workPassVerify.js'
import CompactPageHeader from '../components/CompactPageHeader.jsx'
export default function VerifyWorkPass(){
  const [token,setToken]=useState('')
  const [key,setKey]=useState(null)
  const [claim,setClaim]=useState(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    api.getWorkPassKey().then(data=>{
      if(data.configured&&data.jwk){
        setKey(data)
        // Store only public verification material for offline checking.
        localStorage.setItem('chombutar_workpass_public_key',JSON.stringify(data))
      }
    }).catch(()=>{try{setKey(JSON.parse(localStorage.getItem('chombutar_workpass_public_key')))}catch{}})
  },[])
  async function check(event){
    event.preventDefault();setClaim(null);setError('')
    try{setClaim(await verifyWorkPassToken(token,key))}
    catch(err){setError(err.message)}
  }
  return <main className="mx-auto max-w-xl space-y-4">
    <CompactPageHeader title="Verify Work Pass"/>
    <p className="text-xs text-black/60">Enter the QR payload to check its signature. Cached trusted public keys—including recently rotated keys—permit offline signature verification. Revocation and live work history require an internet connection.</p>
    <form onSubmit={check} className="rounded-2xl bg-white p-4 space-y-3">
      <label className="block text-xs font-bold">Work Pass QR text
        <textarea value={token} onChange={e=>setToken(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-black/15 p-3 text-xs" placeholder="CTWP1.…"/>
      </label>
      <button type="submit" disabled={!key||!token.trim()} className="rounded-full bg-[#0A13E6] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Verify signature</button>
    </form>
    {!key&&<p className="text-xs text-amber-800">The verification key has not been downloaded yet.</p>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">{error}</p>}
    {claim&&<section className="rounded-xl bg-green-50 p-4 text-xs">
      <h2 className="font-black">Valid Chombutar signature</h2>
      <p>{claim.name} · @{claim.username} · {claim.tier}</p>
      <p>Jobs: {claim.completedJobs} · Orbit: {claim.orbit}/100</p>
      <p className="mt-2">Signed snapshot only. Verify current status online before relying on it.</p>
    </section>}
  </main>
}
