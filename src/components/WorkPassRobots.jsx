import { useState } from 'react'
import { api } from '../lib/api.js'
export default function WorkPassRobots({robots=[],onCreated}){
  const [manufacturer,setManufacturer]=useState('')
  const [serial,setSerial]=useState('')
  const [name,setName]=useState('')
  const [capabilities,setCapabilities]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function register(e){
    e.preventDefault();setError('');setBusy(true)
    try{
      const result=await api.workPassAction({action:'work_pass_register_robot',
        manufacturer,serial_number:serial,display_name:name,
        capabilities:capabilities.split(',').map(x=>x.trim()).filter(Boolean)})
      onCreated?.(result.robot)
      setManufacturer('');setSerial('');setName('');setCapabilities('')
    }catch(err){setError(err.message||'Could not register robot.')}
    finally{setBusy(false)}
  }
  return <section aria-label="Robot Work Passes" className="mt-4 space-y-3 rounded-2xl border border-black/10 bg-white p-4">
    <h3 className="text-sm font-black">My robots</h3>
    <p className="text-xs text-black/50">Register equipment under your account. A robot is not verified until the manufacturer has approved it.</p>
    {robots.map(robot=><div key={robot.id} className="rounded-xl bg-[#F7F3EB] p-3 text-xs">
      <strong>{robot.display_name}</strong><p>{robot.manufacturer} · {robot.serial_number}</p>
      <p className="text-black/50">{robot.manufacturer_verified?'Manufacturer verified':'Manufacturer verification pending'}</p>
    </div>)}
    <form onSubmit={register} className="grid gap-2">
      <input required minLength={2} maxLength={80} value={manufacturer} onChange={e=>setManufacturer(e.target.value)} placeholder="Manufacturer" aria-label="Robot manufacturer" className="rounded-xl border border-black/20 p-2 text-xs"/>
      <input required minLength={3} maxLength={120} value={serial} onChange={e=>setSerial(e.target.value)} placeholder="Serial number" aria-label="Robot serial number" className="rounded-xl border border-black/20 p-2 text-xs"/>
      <input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Robot name" aria-label="Robot name" className="rounded-xl border border-black/20 p-2 text-xs"/>
      <input value={capabilities} onChange={e=>setCapabilities(e.target.value)} placeholder="Capabilities, comma-separated" aria-label="Robot capabilities" className="rounded-xl border border-black/20 p-2 text-xs"/>
      <button disabled={busy} className="rounded-full bg-[#0A13E6] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy?'Registering…':'Register robot'}</button>
    </form>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>
}
