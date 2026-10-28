// Burns the SIGNED Work Pass into actual exported video pixels. A CSS badge
// alone disappears when someone forwards a file on WhatsApp/Instagram.
// Do not silently fall back to sending an unbranded video or false "verified" label.
import QRCode from 'qrcode'
import { api } from './api.js'
import { workPassAccent } from '../../shared/workPass.js'

const MAX_DURATION_SECONDS = 120
const MAX_EXPORT_BYTES = 100 * 1024 * 1024
export function videoRecordingType(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return ''
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(type => Recorder.isTypeSupported(type)) || ''
}

export function paintWorkPassSticker(ctx, { width, height, pass, qr }) {
  if(!pass?.token || !qr) throw new Error('A signed Work Pass QR is required for video branding.')
  const unit=Math.max(1,Math.min(width,height)/540)
  const pad=Math.round(12*unit),qrSize=Math.round(130*unit)
  const badgeH=Math.round(154*unit),badgeW=Math.min(width-2*pad,Math.round(340*unit))
  const x=width-pad-badgeW,y=height-pad-badgeH
  ctx.save()
  ctx.fillStyle='rgba(12,18,32,0.88)'
  ctx.fillRect(x,y,badgeW,badgeH)
  ctx.fillStyle=workPassAccent(pass.tier)
  ctx.fillRect(x,y,Math.round(5*unit),badgeH)
  ctx.fillStyle='#fff'
  ctx.font=`bold ${Math.round(15*unit)}px sans-serif`
  ctx.fillText('CHOMBUTAR WORK PASS',x+Math.round(12*unit),y+Math.round(27*unit))
  ctx.font=`bold ${Math.round(16*unit)}px sans-serif`
  ctx.fillText(`${pass.tier} · Signed`,x+Math.round(12*unit),y+Math.round(55*unit))
  ctx.font=`${Math.round(13*unit)}px sans-serif`
  ctx.fillText(('@'+pass.user.username).slice(0,26),x+Math.round(12*unit),y+Math.round(80*unit))
  ctx.fillText('Scan to check past records',x+Math.round(12*unit),y+Math.round(110*unit))
  ctx.fillStyle='#fff'
  const qrX=x+badgeW-qrSize-Math.round(7*unit)
  const qrY=y+Math.round(15*unit)
  ctx.fillRect(qrX-Math.round(3*unit),qrY-Math.round(3*unit),qrSize+Math.round(6*unit),qrSize+Math.round(6*unit))
  ctx.drawImage(qr,qrX,qrY,qrSize,qrSize)
  ctx.restore()
}

// Caller starts this in response to a Share button. Re-encoding is bounded
// to avoid exhausting mobile memory and uses the original video's audio track.
export async function createSignedWorkPassVideo({ url, username, onProgress = () => {} }) {
  if(!url || !username)throw new Error('The original video and its owner are required.')
  if(!window.isSecureContext && location.hostname!=='localhost')
    throw new Error('Video export needs a secure connection.')
  const mimeType=videoRecordingType()
  if(!mimeType || !HTMLCanvasElement.prototype.captureStream)
    throw new Error('This browser cannot export branded videos. Try the latest Chrome.')
  const pass=await api.getWorkPass(username)
  if(!pass.token || pass.signatureStatus!=='signed')
    throw new Error('Signed Work Pass QR is not configured. Cannot create a verified video sticker.')
  const qrUrl=await QRCode.toDataURL(pass.token,{width:500,margin:2,errorCorrectionLevel:'M'})
  const qr=new Image()
  qr.src=qrUrl
  await qr.decode()
  const video=document.createElement('video')
  video.crossOrigin='anonymous'
  video.preload='auto'
  video.playsInline=true
  video.muted=true
  video.src=url
  let recorder,canvasStream,raf=0,ctxAudio
  const finished=new Promise((resolve,reject)=>{
    video.addEventListener('loadedmetadata',resolve,{once:true})
    video.addEventListener('error',()=>reject(new Error('Cannot load the video with cross-origin permission.')),{once:true})
  })
  try {
    await Promise.race([finished,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Video loading timed out.')),15000))])
    if(!Number.isFinite(video.duration) || video.duration<=0 || video.duration>MAX_DURATION_SECONDS)
      throw new Error('Branded export supports videos up to two minutes on this device.')
    const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight))
    const canvas=document.createElement('canvas')
    canvas.width=Math.round(video.videoWidth*scale)
    canvas.height=Math.round(video.videoHeight*scale)
    if(canvas.width<240||canvas.height<240)throw new Error('Video is too small for a readable Work Pass QR.')
    const ctx=canvas.getContext('2d',{alpha:false})
    if(!ctx)throw new Error('Canvas export is unavailable.')
    canvasStream=canvas.captureStream(24)
    // Routing the HTML video through Web Audio retains the soundtrack in
    // the branded recording; connect only to the recording, not speakers.
    const AudioContextType=window.AudioContext||window.webkitAudioContext
    if(!AudioContextType)throw new Error('This browser cannot preserve audio in a video export.')
    ctxAudio=new AudioContextType()
    const audioSource=ctxAudio.createMediaElementSource(video)
    const audioSink=ctxAudio.createMediaStreamDestination()
    audioSource.connect(audioSink)
    for(const track of audioSink.stream.getAudioTracks())canvasStream.addTrack(track)
    const chunks=[]
    let bytes=0
    let exportError=null
    recorder=new MediaRecorder(canvasStream,{mimeType,videoBitsPerSecond:2500000})
    const recorded=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{
        if(e.data?.size){chunks.push(e.data);bytes+=e.data.size}
        if(bytes>MAX_EXPORT_BYTES){
          exportError=new Error('Video export exceeded the safe file-size limit.')
          if(recorder.state!=='inactive')recorder.stop()
        }
      }
      recorder.onerror=e=>reject(e.error||new Error('Video encoding failed.'))
      recorder.onstop=()=>{
        if(exportError)reject(exportError)
        else resolve(new Blob(chunks,{type:mimeType.split(';')[0]}))
      }
    })
    const draw=()=>{
      if(video.readyState>=2){
        ctx.drawImage(video,0,0,canvas.width,canvas.height)
        paintWorkPassSticker(ctx,{width:canvas.width,height:canvas.height,pass,qr})
      }
      const progress=Math.min(99,Math.round(video.currentTime/video.duration*100))
      if(progress!==draw.previousProgress){onProgress(progress);draw.previousProgress=progress}
      if(!video.ended)raf=requestAnimationFrame(draw)
    }
    // Render an initial frame before recording, and never report completion
    // until the encoded file is finalized.
    ctx.fillStyle='#101827';ctx.fillRect(0,0,canvas.width,canvas.height)
    recorder.start(500)
    raf=requestAnimationFrame(draw)
    const ended=new Promise((resolve,reject)=>{
      video.addEventListener('ended',resolve,{once:true})
      video.addEventListener('error',()=>reject(new Error('Video playback failed during export.')),{once:true})
    })
    await ctxAudio.resume()
    await video.play()
    await ended
    cancelAnimationFrame(raf)
    if(recorder.state!=='inactive')recorder.stop()
    const blob=await recorded
    onProgress(100)
    if(!blob.size)throw new Error('Video export produced an empty file.')
    return new File([blob],'chombutar-work-pass.'+(mimeType.startsWith('video/mp4')?'mp4':'webm'),{type:blob.type})
  }finally{
    cancelAnimationFrame(raf)
    video.pause()
    video.removeAttribute('src');video.load()
    if(recorder?.state==='recording')recorder.stop()
    canvasStream?.getTracks().forEach(track=>track.stop())
    await ctxAudio?.close().catch(()=>{})
  }
}
export async function shareSignedWorkPassVideo({url,username,onProgress}){
  const file=await createSignedWorkPassVideo({url,username,onProgress})
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'Chombutar Work Pass video'})
      return 'shared'
    }catch(err){if(err.name==='AbortError')return 'cancelled';throw err}
  }
  const objectURL=URL.createObjectURL(file)
  try {
    const link=document.createElement('a')
    link.href=objectURL;link.download=file.name
    document.body.appendChild(link);link.click();link.remove()
    return 'downloaded'
  }finally{setTimeout(()=>URL.revokeObjectURL(objectURL),30000)}
}
