import {useEffect,useRef,useState} from 'react'
import {Camera,Copy,ImagePlus,RefreshCw,Send} from 'lucide-react'
import {api} from '../lib/api.js'
import {gigReleaseFee} from '../../shared/monetization.js'

let qrCodeModulePromise
function loadQrCodeModule(){
  if(!qrCodeModulePromise)qrCodeModulePromise=import('qrcode').catch(error=>{qrCodeModulePromise=null;throw error})
  return qrCodeModulePromise
}
void loadQrCodeModule().catch(() => {})
const money=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value)
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[12px] font-bold disabled:opacity-40'

export default function DealQrCheckpoint({booking,role,onComplete,compact=false}){
  const stage=booking.work_status==='awaiting_start'?'start':'completion'
  const scope=`${booking.id}:${stage}`
  const currentScope=useRef(scope);currentScope.current=scope
  const [issued,setIssued]=useState(null),[image,setImage]=useState(''),[input,setInput]=useState('')
  const [received,setReceived]=useState(null),[receivedError,setReceivedError]=useState('')
  const [scanning,setScanning]=useState(false),[busy,setBusy]=useState('')
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[sent,setSent]=useState(false)
  const [now,setNow]=useState(Date.now()),[check,setCheck]=useState(0)
  const video=useRef(null),camera=useRef(null),fileInput=useRef(null),scanInFlight=useRef(false)

  useEffect(()=>{
    setIssued(null);setImage('');setInput('');setError('');setNotice('');setSent(false)
    setReceived(null);setReceivedError('');setScanning(false);setBusy('');scanInFlight.current=false
  },[scope])
  useEffect(()=>{
    if(!issued&&!received)return undefined
    const timer=setInterval(()=>setNow(Date.now()),1000)
    return ()=>clearInterval(timer)
  },[issued,received])
  useEffect(()=>{
    if(role!=='talent')return undefined
    let cancelled=false,inFlight=false
    async function refresh(){
      if(inFlight||document.hidden)return
      inFlight=true
      try{
        const result=await api.getReceivedBookingQr(booking.id,stage)
        if(!cancelled){setReceived(result.shared);setReceivedError('');setNow(Date.now())}
      }catch(e){if(!cancelled)setReceivedError(e.message||'Could not check for a code from the client.')}
      finally{inFlight=false}
    }
    void refresh()
    const timer=setInterval(refresh,5000)
    window.addEventListener('focus',refresh)
    return ()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[scope,role,check])

  async function generate(){
    const requestScope=scope
    setBusy('generate');setError('');setNotice('');setIssued(null);setImage('');setSent(false)
    try{
      const next=await api.generateBookingQr(booking.id,stage)
      const {default:QRCode}=await loadQrCodeModule()
      const src=await QRCode.toDataURL(next.token,{width:256,margin:2,errorCorrectionLevel:'M'})
      if(currentScope.current!==requestScope)return
      setIssued(next);setImage(src);setNow(Date.now())
      void api.notifyBookingQrReady(booking.id, stage).catch(()=>{})
    }catch(e){if(currentScope.current===requestScope)setError(e.message||'Could not generate the QR code.')}
    finally{if(currentScope.current===requestScope)setBusy('')}
  }
  async function send(){
    if(!issued)return
    const requestScope=scope
    setBusy('send');setError('');setNotice('')
    try{
      await api.shareBookingQr(booking.id,issued.token)
      if(currentScope.current!==requestScope)return
      setSent(true);setNotice('Code sent to the talent. They can confirm it in this deal before it expires.')
    }catch(e){if(currentScope.current===requestScope)setError(e.message||'Could not send the payment code.')}
    finally{if(currentScope.current===requestScope)setBusy('')}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(issued.token);setNotice('Payment code copied.')}
    catch{setError('Select and copy the manual code below.')}
  }
  async function redeem(token){
    if(scanInFlight.current)return
    scanInFlight.current=true
    const requestScope=scope
    camera.current?.stop();setScanning(false);setBusy('redeem');setError('');setNotice('')
    try{
      const result=await api.redeemBookingQr(booking.id,token.trim())
      if(currentScope.current!==requestScope)return
      setInput('');setReceived(null)
      try{await onComplete(result)}
      catch{setError('Payment was recorded. Refresh this deal to see the latest work status.')}
    }catch(e){if(currentScope.current===requestScope)setError(e.message||'Could not verify this payment code.')}
    finally{if(currentScope.current===requestScope){setBusy('');scanInFlight.current=false}}
  }
  async function scanImage(event){
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    if(!file.type.startsWith('image/')){setError('Choose an image containing the payment QR code.');return}
    if(file.size>10*1024*1024){setError('Choose a QR image smaller than 10 MB.');return}
    const requestScope=scope,src=URL.createObjectURL(file)
    camera.current?.stop();setScanning(false);setBusy('image');setError('')
    try{
      const {BrowserQRCodeReader}=await import('@zxing/browser')
      const reader=new BrowserQRCodeReader()
      let token
      try{
        token=(await reader.decodeFromImageUrl(src)).getText()
      }catch{
        // Some browsers intermittently fail to decode a freshly uploaded
        // object URL. Decode the same image bytes through a canvas as a
        // second independent ZXing path. Never accept the received token
        // or release escrow merely because an image upload occurred.
        const bitmap=await createImageBitmap(file)
        try{
          if(!bitmap.width||!bitmap.height)throw new Error('Empty QR image.')
          const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height))
          const canvas=document.createElement('canvas')
          canvas.width=Math.max(1,Math.round(bitmap.width*scale))
          canvas.height=Math.max(1,Math.round(bitmap.height*scale))
          const context=canvas.getContext('2d',{willReadFrequently:true})
          if(!context)throw new Error('Image canvas unavailable.')
          context.drawImage(bitmap,0,0,canvas.width,canvas.height)
          token=reader.decodeFromCanvas(canvas).getText()
        }finally{bitmap.close?.()}
      }
      if(currentScope.current===requestScope)await redeem(token)
    }catch{if(currentScope.current===requestScope)setError('No readable payment QR was found. Try a clearer image or enter the code.')}
    finally{URL.revokeObjectURL(src);if(currentScope.current===requestScope)setBusy('')}
  }
  useEffect(()=>{
    if(!scanning||!video.current)return undefined
    let stopped=false
    import('@zxing/browser').then(async({BrowserQRCodeReader})=>{
      if(stopped)return
      const controls=await new BrowserQRCodeReader().decodeFromConstraints(
        {video:{facingMode:{ideal:'environment'}}},video.current,(result,_error,activeControls)=>{
          if(!result||scanInFlight.current||stopped)return
          activeControls.stop();void redeem(result.getText())
        })
      if(stopped)controls.stop();else camera.current=controls
    }).catch(()=>{if(!stopped){setScanning(false);setError('Camera unavailable. Scan a QR image, use a received code, or paste the code below.')}})
    return ()=>{stopped=true;camera.current?.stop();camera.current=null}
  },[scanning,scope])

  const expired=issued&&new Date(issued.expiresAt).getTime()<=now
  const receivedExpired=received&&new Date(received.expiresAt).getTime()<=now
  const amount=stage==='start'?Math.floor(Number(booking.amount)*3/10):Number(booking.amount)-Number(booking.start_released_amount||0)
  const fee=gigReleaseFee(Number(booking.amount),stage==='start'?0:Number(booking.start_released_amount||0),amount,Number(booking.gig_fee_bps||0))
  const net=amount-fee
  return <section aria-label="QR payment checkpoint" className={`space-y-3 rounded-[18px] p-4 ${compact?'bg-amber-50':'bg-[#EEF0FF]'}`}>
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0A13E6]">Payment &amp; QR code</p>
      <h2 className="mt-1 text-[15px] font-black">{stage==='start'?'Start work · 30% payment':'Complete work · remaining payment'}</h2>
    </div>
    <p className="text-[12px] leading-relaxed text-black/65">{role==='client'
      ?stage==='start'?'Generate and send the Start QR to the talent when work should begin.':'Delivery is approved. Generate and send the Completion QR for the final payment.'
      :'Confirm a code sent by the client, scan their QR, or scan a saved QR image. Payment goes to your wallet only after verification.'}</p>
    <dl className="grid grid-cols-1 gap-2 rounded-xl bg-white p-3 text-[12px] sm:grid-cols-3">
      <div><dt className="text-black/55">Escrow payment</dt><dd className="font-bold">{money(amount)}</dd></div>
      <div><dt className="text-black/55">Service charge</dt><dd className="font-bold">{money(fee)}</dd></div>
      <div><dt className="text-black/55">Talent receives</dt><dd className="font-black text-[#0A13E6]">{money(net)}</dd></div>
    </dl>
    {error&&<p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>}
    {notice&&<p role="status" className="text-[12px] font-semibold text-green-800">{notice}</p>}
    {role==='client'?<>
      <button type="button" disabled={Boolean(busy)} onClick={generate} className={`${button} bg-[#0A13E6] text-white`}>
        {issued&&<RefreshCw size={15}/>} {busy==='generate'?'Generating…':issued?'Generate new QR':`Generate ${stage} QR`}
      </button>
      {issued&&!expired&&image&&<div className="space-y-3">
        <img src={image} width="256" height="256" alt={`${stage} checkpoint QR for this booking`} className="w-full max-w-[256px] rounded-xl bg-white"/>
        <p className="text-[11px] text-black/60">Expires {new Date(issued.expiresAt).toLocaleTimeString()}. Generating another code replaces this one.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={Boolean(busy)||sent} onClick={send} className={`${button} bg-[#0A13E6] text-white`}>
            <Send size={15}/>{busy==='send'?'Sending…':sent?'Code sent to talent':'Send code to talent'}
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={copy} className={`${button} border border-black/20 bg-white`}><Copy size={15}/>Copy code</button>
        </div>
        <label className="block text-[12px] font-semibold">Manual code (if the talent cannot scan)
          <input readOnly value={issued.token} onFocus={event=>event.target.select()} className="mt-1 block w-full rounded-lg border border-black/20 bg-white p-3 font-mono text-[11px]"/>
        </label>
      </div>}
      {expired&&<p className="text-[12px] text-amber-800">Code expired. Generate and send another QR code.</p>}
    </>:<>
      <div className="space-y-2 rounded-xl bg-white p-3" aria-label="Code sent by the client">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-black">Code sent by the client</h3>
          <button type="button" disabled={Boolean(busy)} onClick={()=>setCheck(value=>value+1)} className={`${button} text-[#0A13E6]`}><RefreshCw size={14}/>Check for code</button>
        </div>
        {received&&!receivedExpired?<>
          <p className="text-[12px]">{stage==='start'?'A Start code is ready. Confirm only when work is beginning.':'A Completion code is ready for the approved delivery.'} Expires {new Date(received.expiresAt).toLocaleTimeString()}.</p>
          <button type="button" disabled={Boolean(busy)} onClick={()=>redeem(received.token)} className={`${button} bg-[#0A13E6] text-white`}>
            {busy==='redeem'?'Verifying…':`Confirm ${stage} payment`}
          </button>
        </>:<p className="text-[12px] text-black/60">{receivedExpired?'The received code expired. Ask the client for a new one.':'No current code has been sent. Ask the client to generate and send it from this deal.'}</p>}
        {receivedError&&<p role="alert" className="text-[12px] text-amber-800">{receivedError}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={()=>setScanning(value=>!value)} className={`${button} bg-[#0A13E6] text-white`}><Camera size={15}/>{scanning?'Stop camera':`Scan ${stage} QR`}</button>
        <button type="button" disabled={Boolean(busy)} onClick={()=>fileInput.current?.click()} className={`${button} border border-black/20 bg-white`}><ImagePlus size={15}/>{busy==='image'?'Reading image…':'Scan QR image'}</button>
        <input ref={fileInput} type="file" accept="image/*" aria-label="Payment QR image" onChange={scanImage} className="sr-only"/>
      </div>
      {scanning&&<video ref={video} muted playsInline autoPlay aria-label="QR scanner camera preview" className="aspect-square w-full max-w-[320px] rounded-xl object-cover"/>}
      <form onSubmit={event=>{event.preventDefault();void redeem(input)}} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-[12px] font-semibold">Or enter the code shown by the client
          <input value={input} onChange={event=>setInput(event.target.value)} autoComplete="off" placeholder="Paste the client's QR code" className="mt-1 block min-h-11 w-full rounded-lg border border-black/20 bg-white px-3 text-[12px]"/>
        </label>
        <button type="submit" disabled={Boolean(busy)||!input.trim()} className={`${button} border border-black/20 bg-white`}>{busy==='redeem'?'Verifying…':'Confirm code'}</button>
      </form>
    </>}
  </section>
}
