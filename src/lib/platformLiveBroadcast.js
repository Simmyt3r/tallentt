import {api} from './api.js'

export function platformRecordingType(){
  if(!globalThis.MediaRecorder)throw new Error('This browser cannot broadcast camera video. Try a current Chrome, Edge, Firefox or Safari browser.')
  const candidates=['video/webm;codecs=vp8,opus','video/webm','video/mp4']
  const mime=candidates.find(type=>MediaRecorder.isTypeSupported(type))
  if(!mime)throw new Error('This browser has no supported Live recording format.')
  return mime
}

function base64(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onerror=()=>reject(new Error('Could not prepare camera video.'))
    reader.onload=()=>resolve(String(reader.result).split(';base64,')[1])
    reader.readAsDataURL(blob)
  })
}

// Each two-second recording has its own container header and keyframe. Late
// viewers can start at the live edge without downloading the entire broadcast.
export async function startPlatformBroadcast({streamId,mediaStream,onConnectionState}){
  const mime=platformRecordingType()
  if(!mediaStream?.getVideoTracks().some(track=>track.readyState==='live'))
    throw new Error('An active camera is required to broadcast.')
  let stopped=false,recorder,timer,sequence=0,uploading=false,state='connecting'
  const pending=[],listeners=new Set(onConnectionState?[onConnectionState]:[])
  let readyResolve,readyReject
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
  function notify(next){state=next;for(const listener of listeners){try{listener(next)}catch{}}}
  function halt(){
    stopped=true;clearTimeout(timer);pending.length=0
    if(recorder?.state==='recording')recorder.stop()
    mediaStream.getTracks().forEach(track=>track.stop())
  }
  function fail(error){
    if(stopped)return
    halt();notify('failed');readyReject(error)
    api.liveAction({action:'end_stream',stream_id:streamId}).catch(()=>{})
  }
  async function upload(){
    if(uploading||stopped)return
    uploading=true
    try{
      while(pending.length&&!stopped){
        const clip=pending[0],encoded=await base64(clip.blob)
        let receipt
        for(let attempt=0;attempt<3;attempt++){
          try{
            receipt=await api.liveAction({action:'upload_video',stream_id:streamId,
              sequence:clip.sequence,mime_type:clip.blob.type||mime,duration_ms:clip.duration,media:encoded})
            break
          }catch(error){
            if(stopped)return
            if(attempt===2||(error.status&&![429,500,502,503,504].includes(error.status)))throw error
            notify('disconnected')
            await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))
          }
        }
        if(stopped)return
        if(receipt?.status!=='live')throw new Error('Video publishing could not be verified.')
        pending.shift();notify('connected');readyResolve()
      }
    }catch(error){fail(error)}finally{uploading=false}
  }
  function capture(){
    if(stopped)return
    let chunks=[],started=performance.now()
    try{
      recorder=new MediaRecorder(mediaStream,{mimeType:mime,videoBitsPerSecond:600000,audioBitsPerSecond:64000})
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)}
      recorder.onerror=()=>fail(new Error('Camera recording stopped unexpectedly. Start a new Live.'))
      recorder.onstop=()=>{
        if(stopped)return
        const duration=Math.round(performance.now()-started)
        const blob=new Blob(chunks,{type:recorder.mimeType||mime})
        if(duration<500||duration>6000||blob.size<16||blob.size>768*1024){
          fail(new Error('The browser paused video capture or produced an oversized segment. Keep Live open and try again.'));return
        }
        if(pending.length>=3){fail(new Error('Your upload connection is too slow for Live. Reconnect and start again.'));return}
        pending.push({blob,duration,sequence:++sequence})
        capture();upload()
      }
      recorder.start()
      timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},2000)
    }catch(error){fail(error)}
  }
  const onTrackEnded=()=>fail(new Error('Camera or microphone disconnected.'))
  mediaStream.getTracks().forEach(track=>track.addEventListener('ended',onTrackEnded))
  const startupTimer=setTimeout(()=>fail(new Error('Camera video could not reach ChombuTar. Check your upload connection.')),20000)
  notify('connecting');capture()
  try{await ready}finally{clearTimeout(startupTimer)}
  return {
    mode:'platform',mediaStream,
    get connectionState(){return state},
    subscribeConnection(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener)},
    async stop(){
      if(stopped)return
      mediaStream.getTracks().forEach(track=>track.removeEventListener('ended',onTrackEnded))
      halt();notify('closed')
    },
  }
}
