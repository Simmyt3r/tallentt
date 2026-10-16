import { useEffect,useRef,useState } from 'react'
import { Mic,MicOff,Phone,PhoneOff,Video,VideoOff } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

// Peer-to-peer WebRTC. SDP/ICE are sent over authenticated ephemeral
// PostgreSQL signaling; ChombuTar never records audio or video.
const FALLBACK_ICE=[{urls:'stun:stun.l.google.com:19302'}]

export default function DealCallControls({escrowId,enabled}) {
  const {user}=useAuth()
  const [call,setCall]=useState(null)
  const [localMedia,setLocalMedia]=useState(null)
  const [remoteMedia,setRemoteMedia]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [muted,setMuted]=useState(false)
  const [cameraOff,setCameraOff]=useState(false)
  const [state,setState]=useState('')
  const callRef=useRef(null)
  const pcRef=useRef(null)
  const localRef=useRef(null)
  const remoteRef=useRef(null)
  const cursorRef=useRef(0)
  const iceQueueRef=useRef([])
  const pollingRef=useRef(false)
  const tickRef=useRef(null)
  const remoteVideoRef=useRef(null)
  const remoteAudioRef=useRef(null)
  const localVideoRef=useRef(null)

  useEffect(()=>{
    if(remoteVideoRef.current)remoteVideoRef.current.srcObject=remoteMedia
    if(remoteAudioRef.current)remoteAudioRef.current.srcObject=remoteMedia
  },[remoteMedia,call?.mode])
  useEffect(()=>{
    if(localVideoRef.current)localVideoRef.current.srcObject=localMedia
  },[localMedia,call?.mode])

  function cleanup(){
    pcRef.current?.close()
    pcRef.current=null
    localRef.current?.getTracks().forEach(track=>track.stop())
    remoteRef.current?.getTracks().forEach(track=>track.stop())
    localRef.current=null;remoteRef.current=null
    callRef.current=null
    cursorRef.current=0
    iceQueueRef.current=[]
    setCall(null);setLocalMedia(null);setRemoteMedia(null)
    setMuted(false);setCameraOff(false);setState('')
  }

  async function prepareMedia(mode){
    if(!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error('Secure browser media calling requires HTTPS and WebRTC support.')
    return navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true},
      video:mode==='video'?{facingMode:'user',width:{ideal:640},height:{ideal:360}}:false,
    })
  }

  function createPeer(stream,iceServers){
    const pc=new RTCPeerConnection({iceServers:iceServers?.length?iceServers:FALLBACK_ICE})
    pcRef.current=pc
    localRef.current=stream
    setLocalMedia(stream)
    stream.getTracks().forEach(track=>pc.addTrack(track,stream))
    pc.onicecandidate=event=>{
      if(!event.candidate || !callRef.current)return
      api.dealCallAction({
        action:'call_signal',call_id:callRef.current.id,
        kind:'ice',payload:event.candidate.toJSON(),
      }).catch(()=>{})
    }
    pc.ontrack=event=>{
      if(!remoteRef.current)remoteRef.current=new MediaStream()
      const target=remoteRef.current
      if(!target.getTracks().some(track=>track.id===event.track.id))target.addTrack(event.track)
      setRemoteMedia(target)
    }
    pc.onconnectionstatechange=()=>{
      setState(pc.connectionState||'')
      if(pc.connectionState==='failed')setError('Media connection failed. End and retry the call. A TURN relay may be needed on some networks.')
    }
    return pc
  }

  async function receiveSignals(signals){
    const pc=pcRef.current
    if(!pc)return false
    for(const signal of signals){
      if(signal.sender_id===user?.id)continue
      if(signal.kind==='offer'&&!pc.remoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
        const answer=await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await api.dealCallAction({action:'call_signal',call_id:callRef.current.id,
          kind:'answer',payload:{type:answer.type,sdp:answer.sdp}})
      }else if(signal.kind==='answer'&&!pc.remoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
      }else if(signal.kind==='ice'){
        if(pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload)).catch(()=>{})
        } else iceQueueRef.current.push(signal.payload)
      }
    }
    if(pc.remoteDescription&&iceQueueRef.current.length){
      const pending=iceQueueRef.current.splice(0)
      for(const item of pending)await pc.addIceCandidate(new RTCIceCandidate(item)).catch(()=>{})
    }
    return true
  }

  async function poll(){
    if(!enabled||pollingRef.current)return
    pollingRef.current=true
    try{
      const result=await api.getDealCall(escrowId,cursorRef.current)
      if(!result.call){
        if(callRef.current)cleanup()
        return
      }
      if(callRef.current?.id && callRef.current.id!==result.call.id){
        // Another call has replaced ours. Never attach media from one call to another.
        cleanup()
      }
      if(!callRef.current || callRef.current.id!==result.call.id){
        cursorRef.current=0
        callRef.current=result.call
      }else callRef.current=result.call
      setCall(result.call)
      if(pcRef.current&&result.signals?.length){
        await receiveSignals(result.signals)
        cursorRef.current=result.cursor
      }
    }catch(err){
      setError(err.message||'Call signaling unavailable.')
      if(err.status===409||err.status===404)cleanup()
    }finally{pollingRef.current=false}
  }
  tickRef.current=poll

  useEffect(()=>{
    if(!enabled)return undefined
    const tick=()=>tickRef.current?.()
    tick()
    const timer=setInterval(tick,2500)
    return ()=>{
      clearInterval(timer)
      const current=callRef.current
      if(current?.id)api.dealCallAction({action:'end_call',call_id:current.id}).catch(()=>{})
      pcRef.current?.close()
      localRef.current?.getTracks().forEach(track=>track.stop())
      remoteRef.current?.getTracks().forEach(track=>track.stop())
      callRef.current=null;pcRef.current=null
    }
  },[enabled,escrowId])

  async function start(mode){
    if(busy||callRef.current)return
    setBusy(true);setError('')
    let stream=null;let started=null
    try{
      stream=await prepareMedia(mode)
      started=await api.dealCallAction({action:'start_call',escrow_id:escrowId,mode})
      callRef.current={id:started.id,mode,caller_id:user.id,status:'ringing'}
      setCall(callRef.current)
      const current=await api.getDealCall(escrowId,0)
      const pc=createPeer(stream,current.iceServers)
      const offer=await pc.createOffer()
      await pc.setLocalDescription(offer)
      await api.dealCallAction({action:'call_signal',call_id:started.id,
        kind:'offer',payload:{type:offer.type,sdp:offer.sdp}})
    }catch(err){
      if(started?.id)api.dealCallAction({action:'end_call',call_id:started.id}).catch(()=>{})
      stream?.getTracks().forEach(track=>track.stop())
      cleanup()
      setError(err.message||'Could not start this call.')
    }finally{setBusy(false)}
  }

  async function answer(){
    const current=callRef.current
    if(!current||current.callee_id!==user?.id||busy)return
    setBusy(true);setError('')
    let stream
    try{
      stream=await prepareMedia(current.mode)
      await api.dealCallAction({action:'accept_call',call_id:current.id})
      const result=await api.getDealCall(escrowId,0)
      createPeer(stream,result.iceServers)
      setCall({...current,status:'accepted'})
      cursorRef.current=0
      tickRef.current?.()
    }catch(err){
      stream?.getTracks().forEach(track=>track.stop())
      await api.dealCallAction({action:'end_call',call_id:current.id}).catch(()=>{})
      cleanup()
      setError(err.message||'Unable to answer the call.')
    }finally{setBusy(false)}
  }

  async function stop(decline=false){
    const current=callRef.current
    if(!current)return
    setBusy(true)
    try{await api.dealCallAction({action:decline?'decline_call':'end_call',call_id:current.id})}
    catch(err){setError(err.message||'Could not end the call.')}
    finally{cleanup();setBusy(false)}
  }

  function toggleMute(){
    const audio=localRef.current?.getAudioTracks()||[]
    audio.forEach(track=>{track.enabled=muted})
    setMuted(!muted)
  }
  function toggleVideo(){
    const video=localRef.current?.getVideoTracks()||[]
    video.forEach(track=>{track.enabled=cameraOff})
    setCameraOff(!cameraOff)
  }

  if(!enabled)return null
  const incoming=call&&call.status==='ringing'&&call.callee_id===user?.id&&!pcRef.current
  const dialing=call&&call.status==='ringing'&&call.caller_id===user?.id
  const active=Boolean(call&&(call.status==='accepted'||dialing)&&localMedia)
  return <section className="shrink-0 space-y-2 border-b border-black/10 bg-white px-3 py-2"
    aria-label="Deal audio and video calling">
    {!call&&<div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>start('audio')} disabled={busy}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 px-3 text-[11px] font-bold disabled:opacity-40">
        <Phone size={15}/> Audio call
      </button>
      <button type="button" onClick={()=>start('video')} disabled={busy}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 px-3 text-[11px] font-bold disabled:opacity-40">
        <Video size={15}/> Video call
      </button>
      <span className="text-[10px] text-black/40">Peer-to-peer. No recording.</span>
    </div>}
    {incoming&&<div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3">
      <span className="min-w-0 flex-1 text-[12px] font-bold">Incoming {call.mode} call</span>
      <button type="button" onClick={answer} disabled={busy}
        className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white">Answer</button>
      <button type="button" onClick={()=>stop(true)} disabled={busy}
        className="min-h-10 rounded-full bg-red-600 px-4 text-[12px] font-bold text-white">Decline</button>
    </div>}
    {active&&<div className="space-y-3 rounded-xl border border-black/10 bg-[#111725] p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold">{dialing?'Calling…':state==='connected'?'Connected':state||'Connecting…'} · {call.mode}</p>
        <button type="button" onClick={()=>stop(false)} disabled={busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-red-600 px-4 text-[11px] font-bold">
          <PhoneOff size={15}/> End
        </button>
      </div>
      {call.mode==='video'&&<div className="grid gap-2 sm:grid-cols-2">
        <video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full rounded-lg bg-black object-contain"/>
        <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full rounded-lg bg-black object-contain"/>
      </div>}
      {call.mode==='audio'&&<>
        <audio ref={remoteAudioRef} autoPlay controls className="w-full"/>
        <p className="text-[11px] text-white/60">Audio is connected directly between both browsers where network conditions permit.</p>
      </>}
      <div className="flex gap-2">
        <button type="button" onClick={toggleMute} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 px-4 text-[11px] font-bold">
          {muted?<MicOff size={14}/>:<Mic size={14}/>} {muted?'Unmute':'Mute'}
        </button>
        {call.mode==='video'&&<button type="button" onClick={toggleVideo}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 px-4 text-[11px] font-bold">
          {cameraOff?<VideoOff size={14}/>:<Video size={14}/>} {cameraOff?'Camera on':'Camera off'}
        </button>}
      </div>
    </div>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{error}</p>}
  </section>
}
