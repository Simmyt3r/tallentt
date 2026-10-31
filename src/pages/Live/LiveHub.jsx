// Path: src/pages/Live/LiveHub.jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Mic, Radio, Users, Wifi, X, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import CompactPageHeader from '../../components/CompactPageHeader.jsx'
import { useAuth } from '../../context/AuthContext'
import UserIdentity from '../../components/UserIdentity'
import { getLiveMedia, startFallbackBroadcast, startWhipBroadcast } from '../../lib/liveBroadcast'
import { clearLivePublisher, setLivePublisher } from '../../lib/liveSession'

const LIVE_READINESS_HELP = {
  unconfigured: 'The production media relay has not been connected. Configure LIVE_MEDIA_SERVER_URL, LIVE_WHIP_URL and LIVE_HLS_BASE_URL.',
  incomplete: 'The production Live relay requires all three media URLs. Check your deployment environment.',
  invalid: 'The media URL configuration is invalid or uses insecure HTTP. WHIP and HLS must be HTTPS in production.',
  health_http_error: 'The media health endpoint returned an error. Check the exact health-check path and relay availability.',
  unexpected_health_response: 'The media health URL returned an HTML page instead of a media service health response.',
  unreachable: 'Vercel cannot reach the media relay. Check its deployment, hostname, TLS and firewall.',
  preflight_failed: 'The app could not verify Live readiness. Check your connection, session and deployment status.',
  cloudinary_unconfigured:'Configure Cloudinary API keys and enable Live Streaming.',
  cloudinary_unavailable:'Cloudinary Live Streaming is unavailable. Check your account permissions and subscription.',
}
const CATEGORIES = ['Music', 'Dance', 'Comedy', 'Fashion', 'Acting', 'Modeling', 'Art & Design', 'Writing', 'Photography', 'Content Creation', 'Sports', 'Other']

function connectionLabel(state) {
  if (state === 'connected') return 'Connected'
  if (state === 'connecting' || state === 'new') return 'Connecting…'
  if (state === 'disconnected') return 'Reconnecting…'
  if (state === 'failed') return 'Connection failed'
  return 'Preview'
}

export default function LiveHub() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const previewRef = useRef(null)
  const handedOffRef = useRef(false)
  const [rooms, setRooms] = useState([])
  const [search, setSearch] = useState('')
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')
  const [mediaReadiness,setMediaReadiness]=useState(null)
  const [roomsRetry, setRoomsRetry] = useState(0)
  const [creating, setCreating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('idle')
  const [media, setMedia] = useState(null)
  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], camera: '', microphone: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.getLiveRooms()
        if (!cancelled) {
          setRooms(data.rooms || [])
          setRoomsError('')
        }
      } catch (err) {
        if (!cancelled) setRoomsError(err?.message || 'Could not load Live rooms.')
      } finally {
        if (!cancelled) setRoomsLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 12000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [roomsRetry])

  useEffect(()=>{
    let active=true
    const check=()=>api.getLiveMediaStatus().then(value=>{if(active)setMediaReadiness(value)})
      .catch(()=>{if(active)setMediaReadiness({broadcast_ready:false,reason:'preflight_failed'})})
    check()
    return()=>{active=false}
  },[])

  useEffect(() => () => {
    if (!handedOffRef.current) media?.getTracks().forEach((track) => track.stop())
  }, [media])

  useEffect(() => {
    if (previewRef.current && media) previewRef.current.srcObject = media
  }, [media, creating])

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        cameras: list.filter((device) => device.kind === 'videoinput'),
        microphones: list.filter((device) => device.kind === 'audioinput'),
      })
    } catch {}
  }

  async function openPreview() {
    // Verify at the moment the user starts. A cached false result from page
    // load must not lock out a server that was brought online afterward.
    let readiness
    try{
      readiness=await api.getLiveMediaStatus()
      setMediaReadiness(readiness)
    }catch{
      readiness={broadcast_ready:false,reason:'preflight_failed'}
      setMediaReadiness(readiness)
    }
    if(readiness.broadcast_ready&&readiness.mode==='cloudinary'){
      setError('')
      setConnectionStatus('ready')
      handedOffRef.current=false
      setMedia(null)
      setCreating(true)
      return
    }
    if(!readiness.broadcast_ready){
      setError(LIVE_READINESS_HELP[readiness.reason] || 'Broadcast is unavailable. The Live media server must be reachable before video can be transmitted to viewers.')
      return
    }
    setError('')
    setConnectionStatus('preview')
    handedOffRef.current = false
    try {
      const stream = await getLiveMedia()
      setMedia(stream)
      setCreating(true)
      await refreshDevices()
    } catch (err) {
      setConnectionStatus('failed')
      setError(err?.message || 'Could not access the camera or microphone.')
    }
  }

  async function switchDevices(next) {
    setForm(next)
    if (!creating) return
    setError('')
    try {
      const stream = await getLiveMedia({ videoDeviceId: next.camera, audioDeviceId: next.microphone })
      media?.getTracks().forEach((track) => track.stop())
      setMedia(stream)
    } catch (err) {
      setError(err?.message || 'Could not switch camera or microphone.')
    }
  }

  function closePreview() {
    media?.getTracks().forEach((track) => track.stop())
    setMedia(null)
    setCreating(false)
    setStarting(false)
    setConnectionStatus('idle')
    setError('')
  }

  async function goLive(event) {
    event.preventDefault()
    if ((!media && mediaReadiness?.mode!=='cloudinary') || starting) return
    setError('')
    setStarting(true)
    let streamId = null
    let publisher = null
    try {
      setConnectionStatus('connecting')
      const created = await api.liveAction({ action: 'create_stream', title: form.title, category: form.category })
      streamId = created.stream.id
      if(created.media_mode==='cloudinary'){
        handedOffRef.current=true
        navigate(`/live/stage/${streamId}`,{state:{isHost:true,mediaMode:'cloudinary'}})
      }else{
        publisher=await startWhipBroadcast({
          ingestUrl:created.ingest_url,publishToken:created.publish_token,
          mediaStream:media,onConnectionState:setConnectionStatus,
        })
        setLivePublisher(streamId,publisher)
        await api.liveAction({action:'mark_live',stream_id:streamId})
        handedOffRef.current=true
        sessionStorage.setItem(`chombutar-live-publisher:${streamId}`,'mediamtx')
        navigate(`/live/stage/${streamId}`,{state:{isHost:true,mediaMode:'mediamtx'}})
      }
    } catch (err) {
      if (streamId) {
        if(mediaReadiness?.mode==='cloudinary')
          api.liveAction({action:'end_stream',stream_id:streamId}).catch(()=>{})
        else api.liveAction({action:'publisher_state',stream_id:streamId,state:'failed'}).catch(()=>{})
        await clearLivePublisher(streamId).catch(() => {})
      } else if (publisher) {
        await publisher.stop().catch(() => {})
      }
      setConnectionStatus('failed')
      setError(err?.message || 'Could not start Live.')
    } finally {
      setStarting(false)
    }
  }

  const canGoLive = ['talent', 'dual'].includes(user?.role)
  const searchTerm = search.trim().toLowerCase()
  const visibleRooms = rooms.filter((room) => [room.title, room.category, room.username, room.full_name, room.host_username]
    .some((value) => String(value ?? '').toLowerCase().includes(searchTerm)))

  return (
    <div className="max-w-[860px] mx-auto space-y-5 pb-8">
      <CompactPageHeader title="ChombuTar Live" icon={Radio} searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="Search live rooms…" searchLabel="Search live rooms by title, category or host"/>

      {mediaReadiness?.broadcast_ready&&mediaReadiness.mode==='cloudinary'&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-[12px] text-blue-900">
        Live uses Cloudinary RTMP. Create a room, then start broadcasting from OBS or an RTMP-capable phone app. Your broadcast is marked LIVE only after Cloudinary detects actual video.
      </p>}
      {mediaReadiness?.broadcast_ready===false&&<div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
        <p className="font-bold">Live Broadcast connection unavailable ({mediaReadiness.reason||'transport not ready'}).</p>
        <p>{LIVE_READINESS_HELP[mediaReadiness.reason] || 'Video publishing requires a running WHIP/MediaMTX relay and HLS playback endpoint.'}</p>
        <p className="text-[11px]">The production media server is separate from Vercel. A camera preview alone is not a public broadcast.</p>
        <button type="button" onClick={async()=>{
          try{setMediaReadiness(await api.getLiveMediaStatus())}
          catch{setMediaReadiness({broadcast_ready:false,reason:'preflight_failed'})}
        }} className="min-h-10 rounded-full border border-amber-400 px-4 font-bold">
          Recheck streaming server
        </button>
      </div>}
      <nav aria-label="Live modes" className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white p-2">
        <button type="button" onClick={() => {
          if (creating) closePreview()
          else if (canGoLive) openPreview()
          else document.getElementById('live-now-list')?.scrollIntoView({behavior:'smooth',block:'start'})
        }}
          aria-current="page" aria-pressed
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white">
          <Radio size={14}/> {creating ? 'Close broadcast setup' : 'Live broadcast'}
        </button>
        <Link to="/live/competitions" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 px-4 text-[12px] font-bold hover:bg-blue-50">
          <Trophy size={14}/> Stage competitions
        </Link>
      </nav>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700">{error}</div>}

      {creating && (
        <form onSubmit={goLive} className="bg-white border-[1.5px] border-black rounded-[24px] overflow-hidden">
          <div className="relative aspect-video bg-black">
            {mediaReadiness?.mode==='cloudinary'
              ? <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-white">
                  <Radio size={38}/><p className="text-sm font-bold">Cloudinary RTMP broadcasting</p>
                  <p className="max-w-md text-xs text-white/75">Create the Live room here. Copy your private RTMP server and key into OBS or an RTMP-capable mobile broadcaster to transmit video to viewers.</p>
                </div>
              : <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover"/>}
            <div className="absolute top-3 left-3 rounded-full bg-black/65 text-white px-3 py-1.5 text-[10px] font-bold">{connectionLabel(connectionStatus)}</div>
            <button type="button" disabled={starting} onClick={closePreview} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/65 text-white grid place-items-center disabled:opacity-50"><X size={16} /></button>
          </div>
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Live title" maxLength={120} required className="h-11 rounded-xl border border-black/20 px-3 text-[13px] outline-none focus:border-black" />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-11 rounded-xl border border-black/20 px-3 text-[13px] bg-white">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
            {mediaReadiness?.mode!=='cloudinary'&&<><label className="text-[11px] font-bold text-black/55"><span className="flex items-center gap-1 mb-1"><Camera size={12} /> Camera</span><select disabled={starting} value={form.camera} onChange={(event) => switchDevices({ ...form, camera: event.target.value })} className="w-full h-10 rounded-xl border border-black/20 px-2 bg-white text-[12px] disabled:opacity-50"><option value="">Default camera</option>{devices.cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}</select></label>
            <label className="text-[11px] font-bold text-black/55"><span className="flex items-center gap-1 mb-1"><Mic size={12} /> Microphone</span><select disabled={starting} value={form.microphone} onChange={(event) => switchDevices({ ...form, microphone: event.target.value })} className="w-full h-10 rounded-xl border border-black/20 px-2 bg-white text-[12px] disabled:opacity-50"><option value="">Default microphone</option>{devices.microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>
            </>}
            <button disabled={starting} className="sm:col-span-2 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"><Wifi size={14} /> {starting?'Creating Live room…':mediaReadiness?.mode==='cloudinary'?'Create RTMP Live room':'Start Live'}</button>
          </div>
        </form>
      )}

      <section id="live-now-list" className="scroll-mt-36 space-y-3">
        <h2 className="text-[14px] font-bold">Live now</h2>
        {roomsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          <span>Live rooms couldn't be refreshed. {roomsError}</span>
          <button type="button" onClick={() => setRoomsRetry((value) => value + 1)}
            className="min-h-10 rounded-full border border-red-300 bg-white px-4 font-bold">Retry loading Live</button>
        </div>}
        {roomsLoading && !rooms.length && <p role="status" className="rounded-2xl bg-white p-6 text-center text-[12px] text-black/55">Loading Live rooms…</p>}
        {!roomsLoading && !roomsError && !visibleRooms.length && <div className="rounded-[22px] border border-black/10 bg-white p-8 text-center text-[12px] text-black/45 font-medium">{searchTerm ? 'No matching Live rooms.' : 'No Talent is live right now.'}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {visibleRooms.map((room) => (
            <Link key={room.id} to={`/live/stage/${room.id}`} className="bg-white rounded-[22px] border-[1.5px] border-black p-4 hover:-translate-y-0.5 transition">
              <div className="flex items-center justify-between gap-3">
                <UserIdentity user={room} />
                <span className={`text-[10px] font-bold text-white px-2 py-1 rounded-full ${room.status === 'live' ? 'bg-red-600' : 'bg-black/60'}`}>{room.media_mode === 'fallback' && room.status === 'live' ? 'LIVE • PREVIEW' : room.status === 'live' ? 'LIVE' : room.status.toUpperCase()}</span>
              </div>
              <h3 className="mt-4 text-[15px] font-bold line-clamp-2">{room.title}</h3>
              <div className="mt-2 flex items-center justify-between text-[11px] text-black/50 font-semibold"><span>{room.category}</span><span className="flex items-center gap-1"><Users size={12} /> {room.viewer_count || 0}</span></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
