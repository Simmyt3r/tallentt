import {useEffect,useMemo,useState} from 'react'
import {ArrowLeft,Download,FileCheck2,Printer,RefreshCw,ShieldCheck} from 'lucide-react'
import {Link,useParams} from 'react-router-dom'
import QRCode from 'qrcode'
import {api} from '../lib/api.js'
import {createAgreementHtml} from '../lib/dealAgreementDocument.js'

export default function DealAgreement(){
  const {dealId}=useParams()
  const [record,setRecord]=useState(null),[error,setError]=useState('')
  const [loading,setLoading]=useState(true),[qr,setQr]=useState('')
  const [frame,setFrame]=useState(null)
  const [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let active=true
    setLoading(true);setRecord(null);setError('')
    api.getDealAgreement(dealId).then(data=>{if(active)setRecord(data)})
      .catch(e=>{if(active)setError(e.message||'Could not open this agreement.')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[dealId,refresh])
  const token=record?.verificationToken||''
  const verifyUrl=token?`${window.location.origin}/deals/verify-agreement?token=${encodeURIComponent(token)}`:''
  useEffect(()=>{
    let active=true
    setQr('')
    if(token)QRCode.toDataURL(verifyUrl,{errorCorrectionLevel:'M',margin:1,width:240})
      .then(value=>{if(active)setQr(value)})
      .catch(()=>{})
    return()=>{active=false}
  },[token,verifyUrl])
  const html=useMemo(()=>record?.agreement
    ?createAgreementHtml(record.agreement,token,verifyUrl,qr):'',
    [record,token,verifyUrl,qr])
  function print(){
    if(!frame?.contentWindow)return
    frame.contentWindow.focus()
    frame.contentWindow.print()
  }
  function download(){
    if(!html)return
    const file=new Blob([html],{type:'text/html;charset=utf-8'})
    const href=URL.createObjectURL(file)
    const a=document.createElement('a')
    a.href=href;a.download=`ChombuTar-Agreement-${dealId}.html`
    document.body.appendChild(a);a.click();a.remove()
    setTimeout(()=>URL.revokeObjectURL(href),1000)
  }
  const valid=record?.agreement?.status==='secured'&&Boolean(token)
  return <main className="mx-auto max-w-4xl space-y-4 pb-12">
    <header className="flex flex-wrap items-center gap-3 border-b border-black/10 pb-3">
      <Link to={`/deals/${dealId}`} aria-label="Back to Deal details"
        className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5"><ArrowLeft size={21}/></Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-[21px] font-black">Agreement</h1>
        <p className="text-[11px] text-black/50">Generated for this transaction only</p>
      </div>
    </header>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</p>}
    {loading&&<p role="status" className="py-8 text-center text-sm text-black/55">Preparing the agreement…</p>}
    {record&&<div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          {valid?<><ShieldCheck size={17} className="text-green-700"/> Funded · online verification required</>:
            <><FileCheck2 size={17}/> {record.documentType==='draft'?'Draft · not an entry pass':'Archived · not an entry pass'}</>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>setRefresh(x=>x+1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-black/15 bg-white px-3 text-[12px] font-semibold"><RefreshCw size={15}/> Refresh</button>
          <button type="button" onClick={download}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-black/15 bg-white px-3 text-[12px] font-semibold"><Download size={15}/> Download (.html)</button>
          <button type="button" onClick={print}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#0A13E6] px-3 text-[12px] font-bold text-white"><Printer size={15}/> Print / Save as PDF</button>
        </div>
      </div>
      <p className="text-[11px] text-black/55">Downloaded HTML opens offline and can be printed. For PDF, choose “Save as PDF” in the print dialog. A physical entry pass is valid only while the live deal status is secured and the venue authorizes entry.</p>
      <iframe ref={setFrame} srcDoc={html} title="ChombuTar service agreement preview"
        className="h-[900px] w-full rounded-xl border border-black/15 bg-white"
        sandbox="allow-same-origin allow-modals"/>
    </div>}
  </main>
}
