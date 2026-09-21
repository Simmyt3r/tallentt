// Path: src/pages/Live/StageRoom.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Heart, Maximize, Mic, MicOff, VideoOff, Wifi, Users, Gift as GiftIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import UserIdentity from '../../components/UserIdentity'

function money(n) { return `₦${Number(n || 0).toLocaleString()}` }
function makeKey() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` }

function StreamPlayer({ stream, quality }) {
  const videoRef = useRef(null)
  const [fallback, setFallback] = useState(false)
  const src = useMemo(() => {
    if (!stream.playback_url) return ''
    try {
      const url = new URL(stream.playback_url)
      if (quality === 'data_saver') url.searchParams.set('clientBandwidthHint', '0.7')
      if (quality === 'high') url.searchParams.set('clientBandwidthHint', '4.0')
      return url.toString()
    } catch { return stream.playback_url }
  }, [stream.playback_url, quality])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'))
    setFallback(!nativeHls)
  }, [src])

  if (fallback) {
    try {
      const url = new URL(stream.playback_url)
      const uid = url.pathname.split('/').filter(Boolean)[0]
      const iframe = `${url.origin}/${uid}/iframe?autoplay=true`
      return <iframe src={iframe} title={stream.title} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen className="w-full h-full border-0 bg-black" />
    } catch {}
  }
  return <video ref={videoRef} key={src} src={src} controls autoPlay playsInline className="w-full h-full object-contain bg-black" />
}


export default function StageRoom() {
  const { id } = useParams()
  const location = useLocation()
  const { user, refreshUser } = useAuth()
  const shellRef = useRef(null)
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quality, setQuality] = useState('auto')
  const [supportOpen, setSupportOpen] = useState(false)
  const [selectedGift, setSelectedGift] = useState(null)
  const [customAmount, setCustomAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [animation, setAnimation] = useState(null)
  const [localMedia, setLocalMedia] = useState({ mic: true, camera: true })

  const load = useCallback(async () => setRoom(await api.getLiveRoom(id)), [id])

  useEffect(() => {
    let dead = false
    load().catch((e) => !dead && setError(e.message || 'Failed to load Live.')).finally(() => !dead && setLoading(false))
    const t = setInterval(() => load().catch(() => {}), 6000)
    return () => { dead = true; clearInterval(t) }
  }, [load])

  useEffect(() => {
    if (!room || room.is_owner || room.status === 'ended') return
    const beat = () => api.liveAction({ action: 'heartbeat_viewer', stream_id: id }).catch(() => {})
    beat()
    const t = setInterval(beat, 20000)
    return () => clearInterval(t)
  }, [id, room?.is_owner, room?.status])

  useEffect(() => {
    if (!room?.is_owner || !['live', 'reconnecting', 'starting'].includes(room.status)) return
    const sync = async () => {
      try {
        await api.liveAction({ action: 'refresh_provider_status', stream_id: id })
        await load()
      } catch {}
    }
    const t = setInterval(sync, 8000)
    return () => clearInterval(t)
  }, [id, load, room?.is_owner, room?.status])

  async function likeLive() {
    if (room.liked_by_me) return
    try {
      const result = await api.liveAction({ action: 'like', stream_id: id })
      setRoom((current) => ({ ...current, likes: result.likes, liked_by_me: true }))
    } catch (e) { alert(e.message) }
  }

  async function sendSupport() {
    if (!selectedGift) return
    setBusy(true)
    try {
      await api.liveAction({
        action: 'send_support',
        stream_id: id,
        gift_id: selectedGift.id,
        custom_amount: selectedGift.custom_amount ? Number(customAmount) : undefined,
        idempotency_key: makeKey(),
      })
      setAnimation(selectedGift)
      setTimeout(() => setAnimation(null), 1800)
      setSupportOpen(false)
      setSelectedGift(null)
      setCustomAmount('')
      await Promise.all([load(), refreshUser()])
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  async function endLive() {
    if (!confirm('End this Live?')) return
    setBusy(true)
    try {
      await api.liveAction({ action: 'end_stream', stream_id: id })
      window.__chombutarLivePublisher?.stop?.()
      await load()
      await refreshUser()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  function toggleTrack(kind) {
    const publisher = window.__chombutarLivePublisher?.peerConnection
    const sender = publisher?.getSenders?.().find((s) => s.track?.kind === kind)
    if (!sender?.track) return
    sender.track.enabled = !sender.track.enabled
    setLocalMedia((s) => ({ ...s, [kind === 'audio' ? 'mic' : 'camera']: sender.track.enabled }))
  }

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading Live…</p>
  if (error || !room) return <p className="text-center text-red-600 py-16 text-[13px] font-medium">{error || 'Live not found.'}</p>

  const isHost = room.is_owner || location.state?.isHost
  const isLive = ['live', 'reconnecting'].includes(room.status)
  const feeRate = Number(room.platform_fee_bps || 0) / 100
  const giftAmount = selectedGift?.custom_amount ? Number(customAmount || 0) : Number(selectedGift?.amount || 0)
  const fee = Math.floor((giftAmount * Number(room.platform_fee_bps || 0)) / 10000)

  return (
    <div className="max-w-[780px] mx-auto space-y-4 pb-10" ref={shellRef}>
      <div className="flex items-center gap-3">
        <Link to="/live" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center"><ArrowLeft size={15} /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-[16px] font-bold truncate">{room.title}</h1><p className="text-[11px] font-semibold text-black/45">{room.category}</p></div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isLive ? 'bg-red-600 text-white' : 'bg-black/10 text-black/60'}`}>{room.status === 'reconnecting' ? 'RECONNECTING…' : room.status.toUpperCase()}</span>
      </div>

      <div className="relative aspect-video rounded-[22px] overflow-hidden bg-black border-[1.5px] border-black">
        {room.status === 'scheduled' || room.status === 'starting' ? <div className="w-full h-full grid place-items-center text-white/70 text-[13px] font-semibold">Talent is preparing the Live</div>
          : room.status === 'ended' ? <div className="w-full h-full grid place-items-center text-white/70 text-[13px] font-semibold">Live has ended</div>
            : room.status === 'failed' ? <div className="w-full h-full grid place-items-center text-red-300 text-[13px] font-semibold">Live stream failed</div>
              : <StreamPlayer stream={room} quality={quality} />}
        {animation && <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center motion-reduce:hidden"><div className="rounded-full bg-black/75 text-white px-5 py-2.5 text-[13px] font-bold shadow-xl animate-bounce">{animation.icon} {animation.name}</div></div>}
        <button onClick={() => shellRef.current?.requestFullscreen?.()} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white grid place-items-center"><Maximize size={15} /></button>
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <UserIdentity user={room} />
          <div className="flex items-center gap-1 text-[11px] font-bold text-black/55"><Users size={13} /> {room.viewer_count || 0} watching</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={likeLive} disabled={room.liked_by_me || !isLive} className="h-10 px-4 rounded-full border-[1.5px] border-black text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-50"><Heart size={14} className={room.liked_by_me ? 'fill-red-500 text-red-500' : ''} /> {room.likes || 0}</button>
          {!isHost && isLive && <button onClick={() => setSupportOpen(true)} className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[12px] font-bold flex items-center gap-1.5"><GiftIcon size={14} /> Support Talent</button>}
          {isHost && isLive && <>
            <button onClick={() => toggleTrack('audio')} className="h-10 px-3 rounded-full border border-black/20 text-[12px] font-bold">{localMedia.mic ? <Mic size={14} /> : <MicOff size={14} />}</button>
            <button onClick={() => toggleTrack('video')} className="h-10 px-3 rounded-full border border-black/20 text-[12px] font-bold">{localMedia.camera ? <Camera size={14} /> : <VideoOff size={14} />}</button>
            <button onClick={endLive} disabled={busy} className="h-10 px-4 rounded-full bg-red-600 text-white text-[12px] font-bold">End Live</button>
          </>}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold"><Wifi size={13} /><span>Quality</span>{[['auto','Auto'],['data_saver','Data Saver'],['high','High Quality']].map(([v,l]) => <button key={v} onClick={() => setQuality(v)} className={`px-3 py-1.5 rounded-full border ${quality === v ? 'bg-black text-white border-black' : 'border-black/15'}`}>{l}</button>)}</div>
      </div>

      {isHost && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[
        ['Today’s Live Earnings', money(room.earnings?.today_net_earnings)], ['Total Gifts', room.earnings?.total_gifts || 0], ['Gross Support', money(room.earnings?.gross_support)], ['Platform Fee', money(room.earnings?.platform_fee)]
      ].map(([l,v]) => <div key={l} className="rounded-[18px] border border-black/10 bg-white p-3"><p className="text-[10px] font-bold text-black/45">{l}</p><p className="text-[16px] font-bold mt-1">{v}</p></div>)}</div>}

      {isHost && room.gift_breakdown?.length > 0 && <section className="bg-white rounded-[20px] border border-black/10 p-4"><h2 className="text-[13px] font-bold mb-3">Gift Breakdown</h2><div className="flex flex-wrap gap-2">{room.gift_breakdown.map((g) => <div key={g.id} className="rounded-full bg-black/[0.04] px-3 py-2 text-[11px] font-semibold">{g.icon} {g.name} × {g.count} · {money(g.gross_amount)}</div>)}</div></section>}

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="bg-white rounded-[20px] border border-black/10 p-4"><h2 className="text-[13px] font-bold mb-3">Recent Support</h2><div className="space-y-2">{(room.recent_support || []).map((s) => <div key={s.id} className="text-[11px] font-semibold text-black/65"><Link to={`/profile/${s.supporter_username}`} className="font-bold text-black hover:underline">^{s.supporter_username}</Link> sent {s.icon} {s.gift_name} • {money(s.gross_amount)}</div>)}{!room.recent_support?.length && <p className="text-[11px] text-black/40">No support yet.</p>}</div></section>
        <section className="bg-white rounded-[20px] border border-black/10 p-4"><h2 className="text-[13px] font-bold mb-3">Top Supporters</h2><div className="space-y-2">{(room.top_supporters || []).map((s,i) => <div key={s.id} className="flex justify-between text-[11px] font-semibold"><span>{i+1}. <Link to={`/profile/${s.username}`} className="font-bold hover:underline">^{s.username}</Link></span><span>{money(s.amount)}</span></div>)}{!room.top_supporters?.length && <p className="text-[11px] text-black/40">No supporters yet.</p>}</div></section>
      </div>

      {supportOpen && <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={() => setSupportOpen(false)}><div className="w-full sm:max-w-[520px] max-h-[82vh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] bg-white p-4" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-[16px] font-bold">Support Talent</h2><p className="text-[11px] text-black/45 font-medium">Real wallet support, credited to the Talent’s withdrawable balance.</p></div><button onClick={() => setSupportOpen(false)} className="text-[12px] font-bold">Close</button></div><div className="grid grid-cols-2 gap-2 mt-4">{(room.gifts || []).map((g) => <button key={g.id} onClick={() => setSelectedGift(g)} className={`text-left rounded-[16px] border p-3 ${selectedGift?.id === g.id ? 'border-[#0A13E6] bg-blue-50' : 'border-black/10'}`}><div className="text-[20px]">{g.icon}</div><div className="text-[12px] font-bold mt-1">{g.name}</div><div className="text-[10px] text-black/45 mt-0.5">{g.custom_amount ? 'Custom amount' : money(g.amount)}</div></button>)}</div>{selectedGift && <div className="mt-4 rounded-[18px] bg-black/[0.03] p-3 space-y-2"><p className="text-[12px] font-bold">{selectedGift.icon} {selectedGift.name}</p><p className="text-[11px] text-black/55">{selectedGift.description}</p>{selectedGift.custom_amount && <input type="number" min="100" max="10000000" step="100" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="Enter amount" className="w-full h-10 rounded-xl border border-black/15 px-3 text-[12px]" />}<div className="flex justify-between text-[11px]"><span>Amount</span><b>{money(giftAmount)}</b></div><div className="flex justify-between text-[11px]"><span>Platform fee ({feeRate}%)</span><b>{money(fee)}</b></div><div className="flex justify-between text-[11px]"><span>Talent receives</span><b>{money(Math.max(0, giftAmount-fee))}</b></div><button onClick={sendSupport} disabled={busy || giftAmount < 100} className="w-full h-11 rounded-full bg-[#0A13E6] text-white text-[12px] font-bold disabled:opacity-40">Confirm Support</button></div>}</div></div>}
    </div>
  )
}
