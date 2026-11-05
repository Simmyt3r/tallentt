import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

const money=value=>{
  try{return '₦'+BigInt(String(value)).toLocaleString('en-NG')}
  catch{return 'Unavailable'}
}
const date=value=>new Date(value).toLocaleString('en-NG')
const label=value=>String(value||'').replace(/_/g,' ')

export default function AdminFinanceAudit({stream,onClose}){
  const [rows,setRows]=useState([])
  const [page,setPage]=useState({cursor:null,attempt:0})
  const [cursor,setCursor]=useState(null)
  const [recorded,setRecorded]=useState(true)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const deals=stream==='deal_fees'
  useEffect(()=>{
    let cancelled=false
    setBusy(true);setError('')
    api.getAdminFinanceAudit(stream,page.cursor).then(data=>{
      if(cancelled)return
      setRows(current=>page.cursor?[...current,...data.transactions.filter(item=>!current.some(row=>row.id===item.id))]:data.transactions)
      setCursor(data.next_cursor);setRecorded(data.recorded)
    }).catch(e=>{if(!cancelled)setError(e.message||'Could not load commission records.')})
      .finally(()=>{if(!cancelled)setBusy(false)})
    return ()=>{cancelled=true}
  },[stream,page])
  return <section className="min-w-0 rounded-2xl border border-black/15 bg-white p-4" aria-label="Platform fee accrual audit" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-[14px] font-black">{deals?'Commissions by deal':'Live support fee audit trail'}</h4>
      <button type="button" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-[11px]">Close audit</button>
    </div>
    {error&&<div role="alert" className="mt-3 text-[12px] text-red-700">
      {error} <button type="button" onClick={()=>setPage(current=>({...current,attempt:current.attempt+1}))} className="min-h-10 px-3 font-bold underline">Retry</button>
    </div>}
    {busy&&<p role="status" className="mt-3 text-[12px]">Loading commission records…</p>}
    <p className="mt-3 text-[11px] text-black/55 sm:hidden">Swipe across the table to see all amounts and fee records.</p>
    <div className="mt-3 overflow-x-auto">
      {deals?<table className="w-full min-w-[840px] text-left text-[11px]">
        <caption className="sr-only">Recorded commission, refund reversals and net earnings for each deal</caption>
        <thead><tr className="border-b border-black/15">
          {['Last recorded','Deal / reference','Client / Talent','Deal amount','Commission','Reversed','Net earned','Fee records'].map(title=><th key={title} scope="col" className="p-2">{title}</th>)}
        </tr></thead>
        <tbody>{rows.map(item=><tr key={item.id} className="border-b border-black/10 align-top">
          <td className="p-2">{date(item.created_at)}</td>
          <td className="max-w-56 p-2">
            <p className="font-bold">{item.deal_title||'Deal listing unavailable'}</p>
            <p className="mt-1 break-all font-mono">{item.id}</p>
            <p className="mt-1 capitalize text-black/55">{label(item.status)} · {label(item.work_status)}</p>
          </td>
          <td className="p-2">
            <p>Client: {item.client_username||'Deleted account'}</p>
            <p>Talent: {item.talent_username||'Deleted account'}</p>
          </td>
          <td className="p-2 tabular-nums">{money(item.deal_amount)}</td>
          <td className="p-2 tabular-nums">{money(item.commission_gross)}</td>
          <td className="p-2 tabular-nums">{money(item.commission_reversed)}</td>
          <td className="p-2 font-bold tabular-nums text-[#0A13E6]">{money(item.commission_net)}</td>
          <td className="min-w-48 p-2"><details>
            <summary className="min-h-10 cursor-pointer font-bold">View fee records</summary>
            {item.events.map(event=><div key={event.id} className="mt-2 border-t border-black/10 pt-2">
              <p className="capitalize">{label(event.stage)} · {event.rate_bps/100}%</p>
              <p>{money(event.fee_amount)} on {money(event.gross_amount)}</p>
              <p>{date(event.created_at)}</p>
              <p className="break-all font-mono">{event.id}</p>
            </div>)}
            {item.reversed_at&&<div className="mt-2 border-t border-black/10 pt-2">
              <p>Commission reversal: {money(item.commission_reversed)}</p>
              <p>Deal refund: {money(item.refunded_gross)}</p>
              <p>{date(item.reversed_at)}</p>
            </div>}
          </details></td>
        </tr>)}</tbody>
      </table>:<table className="w-full min-w-[620px] text-left text-[11px]">
        <thead><tr className="border-b border-black/15">
          {['Recorded','Source reference','Supporter / Talent','Gross','Platform fee','Talent net'].map(title=><th key={title} scope="col" className="p-2">{title}</th>)}
        </tr></thead>
        <tbody>{rows.map(item=><tr key={item.id} className="border-b border-black/10">
          <td className="p-2">{date(item.created_at)}</td>
          <td className="max-w-36 break-all p-2 font-mono">{item.id}</td>
          <td className="p-2">{item.supporter_username||'Deleted account'} / {item.talent_username||'Deleted account'}</td>
          <td className="p-2">{money(item.gross_amount)}</td>
          <td className="p-2 font-bold">{money(item.platform_fee)}</td>
          <td className="p-2">{money(item.net_amount)}</td>
        </tr>)}</tbody>
      </table>}
    </div>
    {!busy&&!error&&!recorded&&<p className="p-3 text-[12px] text-amber-800">Commission records are unavailable. Apply the billing migration in Database Migrations.</p>}
    {!busy&&!error&&recorded&&!rows.length&&<p className="p-3 text-[12px] text-black/50">{deals?'No deal commissions recorded yet.':'No posted, successful accruals found.'}</p>}
    {cursor&&<button type="button" disabled={busy||Boolean(error)} onClick={()=>setPage({cursor,attempt:0})}
      className="mt-3 min-h-10 rounded-full border border-black/20 px-4 py-2 text-[12px] font-bold">{deals?'Load older deals':'Load older accruals'}</button>}
  </section>
}
