// ChombuTar's browser LiveKit publisher. Camera capture is first requested by
// LiveHub for its local preview; the very same tracks are published to LiveKit.
import {Room,RoomEvent} from 'livekit-client'

export async function startLivekitBroadcast({url,token,mediaStream,onConnectionState}){
  if(!/^wss:\/\//.test(String(url||''))||!token)
    throw new Error('LiveKit Cloud connection information is missing.')
  const tracks=mediaStream?.getTracks?.()||[]
  if(!tracks.some(t=>t.kind==='video'&&t.readyState==='live')||
     !tracks.some(t=>t.kind==='audio'&&t.readyState==='live'))
    throw new Error('Turn on your camera and microphone to start Live.')
  const room=new Room({adaptiveStream:true,dynacast:true})
  const listeners=new Set(onConnectionState?[onConnectionState]:[])
  const emit=state=>{for(const fn of listeners){try{fn(state)}catch{}}}
  room.on(RoomEvent.ConnectionStateChanged,emit)
  let stopped=false
  try{
    await room.connect(url,token)
    for(const track of tracks)await room.localParticipant.publishTrack(track,{
      name:track.kind==='video'?'camera':'microphone',
    })
    emit('connected')
  }catch(error){
    await room.disconnect().catch(()=>{})
    throw new Error(error?.message||'LiveKit could not publish your camera and microphone.')
  }
  return {
    mode:'livekit',room,mediaStream,
    get connectionState(){return stopped?'disconnected':room.state},
    subscribeConnection(fn){
      listeners.add(fn)
      fn(stopped?'disconnected':room.state)
      return ()=>listeners.delete(fn)
    },
    async stop(){
      if(stopped)return
      stopped=true
      await room.disconnect().catch(()=>{})
      tracks.forEach(t=>t.stop())
      emit('disconnected')
    },
  }
}
