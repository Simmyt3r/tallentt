import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'

const money=(value,currency='NGN')=>{
  try{return (currency&&currency!=='NGN'?currency+' ':'₦')+BigInt(String(value)).toLocaleString('en-NG')}
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
  const billing=['salary_tracking','salary_tracking_talent','business_verification','subscription'].includes(stream)
  const billingNames={
    salary_tracking:'Client salary tracking',
    salary_tracking_talent:'Talent salary tracking',
    business_verification:'Business verification',
    subscription:'Subscriptions',
  }
  useEffect(()=>{
    let cancelled=false
    setBusy(true);setError('')
    api.getAdminFinanceAudit(stream,page.cursor).then(data=>{
      if(cancelled)return
      setRows(current=>page.cursor?[...current,...data.transactions.filter(item=>!current.some(row=>row.id===item.id))]:data.transactions)
      setCursor(data.next_cursor);setRecorded(data.recorded)
    }).catch(e=>{if(!cancelled)setError(e.message||'Could not load service charge records.')})
      .finally(()=>{if(!cancelled)setBusy(false)})
    return ()=>{cancelled=true}
  },[stream,page])
  return <section className="min-w-0 rounded-2xl border border-black/15 bg-white p-4" aria-label="Platform fee accrual audit" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-[14px] font-black">{deals?'Service charges by deal':billing?(billingNames[stream]+' charge audit'):'Live support fee audit trail'}</h4>
      <button type="button" onClick={onClose} className="rounded-full border border-black/20 px-3 py-2 text-[11px]">Close audit</button>
    </div>
    {error&&<div role="alert" className="mt-3 text-[12px] text-red-700">
      {error} <button type="button" onClick={()=>setPage(current=>({...current,attempt:current.attempt+1}))} className="min-h-10 px-3 font-bold underline">Retry</button>
    </div>}
    {busy&&<p role="status" className="mt-3 text-[12px]">Loading service charge records…</p>}
    <p className="mt-3 text-[11px] text-black/55 sm:hidden">Swipe across the table to see all amounts and fee records.</p>
    <div className="mt-3 overflow-x-auto">
      {deals?<table className="w-full min-w-[840px] text-left text-[11px]">
        <caption className="sr-only">Recorded service charges, refund reversals and net earnings for each deal</caption>
        <thead><tr className="border-b border-black/15">
          {['Last recorded','Deal / reference','Client / Talent','Deal amount','Service charge','Reversed','Net earned','Fee records'].map(title=><th key={title} scope="col" className="p-2">{title}</th>)}
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
          <td className="p-2 tabular-nums">{money(item.deal_amount,item.currency)}</td>
          <td className="p-2 tabular-nums">{item.commission_status==='unverified'?'Unverified':money(item.commission_gross)}</td>
          <td className="p-2 tabular-nums">{item.commission_status==='unverified'?'Unverified':money(item.commission_reversed)}</td>
          <td className="p-2 font-bold tabular-nums text-[#0A13E6]">{item.commission_status==='unverified'?'Unverified':money(item.commission_net)}</td>
          <td className="min-w-48 p-2">{!item.events.length?<p className="text-black/60">{item.commission_status==='unverified'?'Fee terms exist, but no matching service charge receipt could be verified.':'No service charge was collected on this earlier deal.'}</p>:<details>
            <summary className="min-h-10 cursor-pointer font-bold">View fee records</summary>
            {item.events.map(event=><div key={event.id} className="mt-2 border-t border-black/10 pt-2">
              <p className="capitalize">{label(event.stage)} · {event.rate_bps/100}%</p>
              <p>{money(event.fee_amount)} on {money(event.gross_amount)}</p>
              <p>{date(event.created_at)}</p>
              <p className="break-all font-mono">{event.id}</p>
              {event.source_transaction_id&&<p className="mt-1 break-all">{event.origin==='historical_test'?'Test deduction transaction:':'Recovered from transaction:'} <span className="font-mono">{event.source_transaction_id}</span></p>}
            </div>)}
            {item.reversed_at&&<div className="mt-2 border-t border-black/10 pt-2">
              <p>Service charge reversal: {money(item.commission_reversed)}</p>
              <p>Deal refund: {money(item.refunded_gross)}</p>
              <p>{date(item.reversed_at)}</p>
              {item.refund_transaction_id&&<p className="break-all">Refund transaction: {item.refund_transaction_id}</p>}
            </div>}
          </details>}</td>
        </tr>)}</tbody>
      </table>:billing?<table className="w-full min-w-[720px] text-left text-[11px]">
        <caption className="sr-only">Source-linked billing charges with verified wallet debit and refund evidence</caption>
        <thead><tr className="border-b border-black/15">
          {['Recorded','Subscriber','Source record','Charge','Status','Wallet evidence'].map(title=>
            <th key={title} scope="col" className="p-2">{title}</th>)}
        </tr></thead>
        <tbody>{rows.map(item=><tr key={item.id} className="border-b border-black/10 align-top">
          <td className="p-2">{date(item.created_at)}</td>
          <td className="p-2">{item.username||'Unavailable'}</td>
          <td className="max-w-56 break-all p-2">
            <p className="font-mono">{item.source_id}</p>
            <p className="mt-1 text-black/45">Receipt {item.id}</p>
          </td>
          <td className="p-2 font-semibold tabular-nums">{money(item.amount)}</td>
          <td className="p-2 capitalize">{label(item.status)}{item.refunded_at&&<p className="mt-1 text-black/50">Refunded {date(item.refunded_at)}</p>}</td>
          <td className="p-2">
            <strong className={item.wallet_evidence==='charged_verified'||item.wallet_evidence==='refunded_verified'
              ?'text-green-700':'text-amber-800'}>
              {item.wallet_evidence==='charged_verified'?'Matched wallet charge'
                :item.wallet_evidence==='refunded_verified'?'Matched wallet charge and refund'
                :item.wallet_evidence==='refund_unverified'?'Refund evidence missing or duplicated'
                :item.wallet_evidence==='unexpected_refund'?'Wallet refund exists but receipt remains charged'
                :'Wallet debit missing or duplicated'}
            </strong>
            <p className="mt-1 text-black/55">Matching debits: {item.matching_debits??'—'} · refunds: {item.matching_refunds??'—'}</p>
            <p className="mt-1 break-all font-mono text-black/55">{item.reference}</p>
          </td>
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
    {!busy&&!error&&!recorded&&<p className="p-3 text-[12px] text-amber-800">{billing?'Billing charge records are unavailable. Apply the Monetization migration in Admin.':'Service charge records are unavailable. Apply the billing migration in Database Migrations.'}</p>}
    {!busy&&!error&&recorded&&!rows.length&&<p className="p-3 text-[12px] text-black/50">{deals?'No deal service charges recorded yet.':billing?'No billing receipts in this category.':'No posted, successful accruals found.'}</p>}
    {cursor&&<button type="button" disabled={busy||Boolean(error)} onClick={()=>setPage({cursor,attempt:0})}
      className="mt-3 min-h-10 rounded-full border border-black/20 px-4 py-2 text-[12px] font-bold">{deals?'Load older deals':billing?'Load older billing receipts':'Load older accruals'}</button>}
  </section>
}
