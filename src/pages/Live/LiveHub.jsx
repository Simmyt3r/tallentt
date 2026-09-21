// Path: src/pages/Live/LiveHub.jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Mic, Radio, Users, Wifi, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import UserIdentity from '../../components/UserIdentity'
import { getLiveMedia, startWhipBroadcast } from '../../lib/liveBroadcast'

const CATEGORIES = ['Music', 'Dance', 'Comedy', 'Fashion', 'Acting', 'Modeling', 'Art & Design', 'Writing', 'Photography', 'Content Creation', 'Sports', 'Other']

export default function LiveHub() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const previewRef = useRef(null)
  const [rooms, setRooms] = useState([])
  const [creating, setCreating] = useState(false)
  const [media, setMedia] = useState(null)
  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], camera: '', microphone: '' })
  const [error, setError] = useState('')

  async function load() {
    const data = await api.getLiveRooms('stage')
    setRooms(data.rooms || [])
  }

  useEffect(() => {
    load().catch(() => {})
    const t = setInterval(() => load().catch(() => {}), 12000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => () => media?.getTracks().forEach((track) => track.stop()), [media])

  useEffect(() => {
    if (previewRef.current && media) previewRef.current.srcObject = media
  }, [media, creating])

  async function openPreview() {
    setError('')
    try {
      const stream = await getLiveMedia()
      setMedia(stream)
      setCreating(true)
      if (previewRef.current) previewRef.current.srcObject = stream
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        cameras: list.filter((d) => d.kind === 'videoinput'),
        microphones: list.filter((d) => d.kind === 'audioinput'),
      })
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied.' : 'No usable camera/microphone was found.')
    }
  }

  async function switchDevices(next) {
    setForm(next)
    if (!creating) return
    try {
      media?.getTracks().forEach((track) => track.stop())
      const stream = await getLiveMedia({ videoDeviceId: next.camera, audioDeviceId: next.microphone })
      setMedia(stream)
      if (previewRef.current) previewRef.current.srcObject = stream
    } catch (err) {
      setError(err.message || 'Could not switch device.')
    }
  }

  async function goLive(e) {
    e.preventDefault()
    if (!media) return
    setError('')
    try {
      const { stream, ingest_url: ingestUrl } = await api.liveAction({ action: 'create_stream', title: form.title, category: form.category })
      const publisher = await startWhipBroadcast({ ingestUrl, mediaStream: media })
      sessionStorage.setItem(`chombutar-live-publisher:${stream.id}`, 'active')
      window.__chombutarLivePublisher = publisher
      await api.liveAction({ action: 'mark_live', stream_id: stream.id })
      navigate(`/live/stage/${stream.id}`, { state: { isHost: true } })
    } catch (err) {
      setError(err.message || 'Could not start Live.')
    }
  }

  const canGoLive = ['talent', 'dual'].includes(user?.role)

  return (
    <div className="max-w-[860px] mx-auto space-y-5 pb-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight flex items-center gap-2"><Radio size={20} className="text-[#0A13E6]" /> ChombuTar Live</h1>
          <p className="text-[12px] text-black/50 font-medium mt-1">Watch talent live. Support careers with real value.</p>
        </div>
        {canGoLive && !creating && <button onClick={openPreview} className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-bold">Go Live</button>}
      </header>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700">{error}</div>}

      {creating && (
        <form onSubmit={goLive} className="bg-white border-[1.5px] border-black rounded-[24px] overflow-hidden">
          <div className="relative aspect-video bg-black">
            <video ref={previewRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <button type="button" onClick={() => { media?.getTracks().forEach((t) => t.stop()); setMedia(null); setCreating(false) }} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/65 text-white grid place-items-center"><X size={16} /></button>
          </div>
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Live title" maxLength={120} required className="h-11 rounded-xl border border-black/20 px-3 text-[13px] outline-none focus:border-black" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-11 rounded-xl border border-black/20 px-3 text-[13px] bg-white">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <label className="text-[11px] font-bold text-black/55"><span className="flex items-center gap-1 mb-1"><Camera size={12} /> Camera</span><select value={form.camera} onChange={(e) => switchDevices({ ...form, camera: e.target.value })} className="w-full h-10 rounded-xl border border-black/20 px-2 bg-white text-[12px]"><option value="">Default camera</option>{devices.cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}</select></label>
            <label className="text-[11px] font-bold text-black/55"><span className="flex items-center gap-1 mb-1"><Mic size={12} /> Microphone</span><select value={form.microphone} onChange={(e) => switchDevices({ ...form, microphone: e.target.value })} className="w-full h-10 rounded-xl border border-black/20 px-2 bg-white text-[12px]"><option value="">Default microphone</option>{devices.microphones.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select></label>
            <button className="sm:col-span-2 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-bold flex items-center justify-center gap-2"><Wifi size={14} /> Start Live</button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-[14px] font-bold">Live now</h2>
        {!rooms.length && <div className="rounded-[22px] border border-black/10 bg-white p-8 text-center text-[12px] text-black/45 font-medium">No Talent is live right now.</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {rooms.map((room) => (
            <Link key={room.id} to={`/live/stage/${room.id}`} className="bg-white rounded-[22px] border-[1.5px] border-black p-4 hover:-translate-y-0.5 transition">
              <div className="flex items-center justify-between gap-3">
                <UserIdentity user={room} />
                <span className={`text-[10px] font-bold text-white px-2 py-1 rounded-full ${room.status === 'live' ? 'bg-red-600' : 'bg-black/60'}`}>{room.status === 'live' ? 'LIVE' : room.status.toUpperCase()}</span>
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
