import {useEffect,useRef,useState} from 'react'
import {Room,RoomEvent,Track} from 'livekit-client'
import {api} from '../../lib/api'
import {getLivePublisher} from '../../lib/liveSession'

// Only the authenticated Talent can publish. All other ChombuTar accounts
// receive subscribe-only tokens from the backend, even if they forge UI state.
export default function LiveKitStage({id,hostId,isHost,onState}){
  const videoRef=useRef(null)
  const audioRef=useRef(null)
  const roomRef=useRef(null)
  const [error,setError]=useState('')
  const [audioEnabled,setAudioEnabled]=useState(false)

  useEffect(()=>{
    let active=true
    const video=videoRef.current
    const audio=audioRef.current
    if(!video)return
    const playing=()=>onState?.('playing')
    const waiting=()=>onState?.('loading')
    video.addEventListener('playing',playing)
    video.addEventListener('waiting',waiting)
    if(isHost){
      const publisher=getLivePublisher(id)
      if(publisher?.mode==='livekit'){
        video.srcObject=publisher.mediaStream
        video.muted=true
        video.play().catch(()=>{})
        onState?.('playing')
      }else{
        onState?.('unavailable')
        setError('Your browser no longer has this camera session. End the old Live and start a new one.')
      }
      return ()=>{
        video.removeEventListener('playing',playing)
        video.removeEventListener('waiting',waiting)
        video.srcObject=null
      }
    }
    let connection=null
    const subscribe=(track,_publication,participant)=>{
      if(participant.identity!==hostId||!active)return
      if(track.kind===Track.Kind.Video&&video)track.attach(video)
      if(track.kind===Track.Kind.Audio&&audio)track.attach(audio)
    }
    const unsubscribe=(track)=>{
      track.detach()
      if(active)onState?.('reconnecting')
    }
    const start=async()=>{
      try{
        onState?.('loading')
        const {url,token}=await api.getLivekitToken(id)
        if(!active)return
        connection=new Room({adaptiveStream:true,dynacast:true})
        roomRef.current=connection
        connection.on(RoomEvent.TrackSubscribed,subscribe)
        connection.on(RoomEvent.TrackUnsubscribed,unsubscribe)
        connection.on(RoomEvent.Disconnected,()=>{if(active)onState?.('reconnecting')})
        await connection.connect(url,token)
      }catch(err){
        if(!active)return
        setError(err.message||'Unable to connect to LiveKit video.')
        onState?.('error')
      }
    }
    start()
    return ()=>{
      active=false
      roomRef.current=null
      connection?.disconnect().catch(()=>{})
      video.removeEventListener('playing',playing)
      video.removeEventListener('waiting',waiting)
      video.removeAttribute('src')
      video.srcObject=null
      audio?.removeAttribute('src')
    }
  },[id,hostId,isHost,onState])

  async function enableSound(){
    try{
      await roomRef.current?.startAudio?.()
      await audioRef.current?.play?.()
      setAudioEnabled(true)
      setError('')
    }catch{
      setError('Your browser blocked sound. Tap again or check the site audio permission.')
    }
  }

  return <div className="relative h-full w-full bg-black">
    <video ref={videoRef} autoPlay playsInline muted={isHost}
      controls={!isHost} className="h-full w-full object-contain bg-black"/>
    {!isHost&&<audio ref={audioRef} autoPlay playsInline/>}
    {!isHost&&!audioEnabled&&<button type="button" onClick={enableSound}
      className="absolute bottom-4 left-4 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-black shadow">
      Tap to enable sound
    </button>}
    {error&&<p role="alert" className="absolute left-3 right-3 top-3 rounded-lg bg-black/80 p-3 text-[12px] font-semibold text-white">{error}</p>}
  </div>
}
