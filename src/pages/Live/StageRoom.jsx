// Path: src/pages/Live/StageRoom.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { ArrowLeft, Camera, Heart, Maximize, Mic, MicOff, VideoOff, Wifi, Users, Gift as GiftIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import UserIdentity from '../../components/UserIdentity'
import { connectLiveRealtime } from '../../lib/liveRealtime'
import { clearLivePublisher, getLivePublisher } from '../../lib/liveSession'

function money(n) { return `₦${Number(n || 0).toLocaleString()}` }
function makeKey() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` }

function applyQuality(hls, mode) {
  const levels = hls?.levels || []
  if (!levels.length) return

  if (mode === 'auto') {
    hls.autoLevelCapping = -1
    hls.currentLevel = -1
    return
  }

  const ranked = levels
    .map((level, index) => ({ index, height: Number(level.height || 0), bitrate: Number(level.bitrate || 0) }))
    .sort((a, b) => (a.height || a.bitrate) - (b.height || b.bitrate))

  if (mode === 'data_saver') {
    const capped = ranked.filter((level) => level.height ? level.height <= 360 : level.bitrate <= 650000)
    const target = (capped.length ? capped[capped.length - 1] : ranked[0])?.index ?? 0
    hls.currentLevel = -1
    hls.autoLevelCapping = target
    return
  }

  const highest = ranked[ranked.length - 1]?.index ?? -1
  hls.autoLevelCapping = highest
  hls.currentLevel = highest
}

function StreamPlayer({ src, quality, onState }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const retryTimerRef = useRef(null)
  const retriesRef = useRef(0)

  useEffect(() => {
    if (hlsRef.current) applyQuality(hlsRef.current, quality)
  }, [quality])

  useEffect(() => {
    const video = videoRef.current
    clearTimeout(retryTimerRef.current)
    retriesRef.current = 0
    if (!video || !src) {
      onState?.('unavailable')
      return undefined
    }

    const onPlaying = () => onState?.('playing')
    const onWaiting = () => onState?.('loading')
    const onEnded = () => onState?.('ended')
    const onNativeError = () => onState?.('error')
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onNativeError)

    let hls = null
    if (Hls.isSupported()) {
      onState?.('loading')
      hls = new Hls({
        lowLatencyMode: true,
        enableWorker: true,
        backBufferLength: 30,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 6,
        maxLiveSyncPlaybackRate: 1.15,
      })
      hlsRef.current = hls
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src))
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyQuality(hls, quality)
        retriesRef.current = 0
        video.play().catch(() => onState?.('loading'))
      })
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        retriesRef.current = 0
        if (!video.paused && video.readyState >= 2) onState?.('playing')
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (retriesRef.current >= 6) {
            onState?.('error')
            return
          }
          retriesRef.current += 1
          onState?.('reconnecting')
          clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => hls.startLoad(), Math.min(8000, 750 * retriesRef.current))
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          onState?.('reconnecting')
          hls.recoverMediaError()
          return
        }
        onState?.('error')
        hls.destroy()
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      onState?.('loading')
      video.src = src
      video.play().catch(() => onState?.('loading'))
    } else {
      onState?.('unsupported')
    }

    return () => {
      clearTimeout(retryTimerRef.current)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onNativeError)
      hls?.destroy()
      if (hlsRef.current === hls) hlsRef.current = null
      video.removeAttribute('src')
      video.load()
    }
  }, [src, onState])

  return <video ref={videoRef} controls autoPlay playsInline className="w-full h-full object-contain bg-black" />
}

function supportIdentity(support) {
  return {
    username: support.supporter_username,
    full_name: support.supporter_full_name,
    avatar_url: support.supporter_avatar_url,
    role: support.supporter_role,
    company_suffix: support.supporter_company_suffix,
  }
}

function playbackMessage(state) {
  if (state === 'reconnecting') return 'Reconnecting to HLS…'
  if (state === 'unavailable') return 'HLS stream is not available yet.'
  if (state === 'unsupported') return 'This browser cannot play HLS.'
  if (state === 'error') return 'HLS playback failed. The media server may be unavailable.'
  if (state === 'loading') return 'Loading Live chunks…'
  return ''
}

function publisherLabel(state) {
  if (state === 'connected') return 'Broadcast connected'
  if (state === 'disconnected') return 'Broadcast reconnecting…'
  if (state === 'failed') return 'Broadcast connection failed'
  if (state === 'connecting' || state === 'new') return 'Broadcast connecting…'
  return state ? `Broadcast: ${state}` : 'Broadcast session unavailable'
}

export default function StageRoom() {
  const { id } = useParams()
  const location = useLocation()
  const { user, refreshUser } = useAuth()
  const shellRef = useRef(null)
  const lastPublisherStateRef = useRef('')
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quality, setQuality] = useState('auto')
  const [playbackState, setPlaybackState] = useState('loading')
  const [publisherConnection, setPublisherConnection] = useState('')
  const [realtimeState, setRealtimeState] = useState('disabled')
  const [supportOpen, setSupportOpen] = useState(false)
  const [selectedGift, setSelectedGift] = useState(null)
  const [customAmount, setCustomAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [animation, setAnimation] = useState(null)
  const [localMedia, setLocalMedia] = useState({ mic: true, camera: true })

  const load = useCallback(async () => setRoom(await api.getLiveRoom(id)), [id])
  const isHost = Boolean(room && (room.is_owner || location.state?.isHost))

  useEffect(() => {
    let dead = false
    load().catch((err) => !dead && setError(err.message || 'Failed to load Live.')).finally(() => !dead && setLoading(false))
    const timer = setInterval(() => load().catch(() => {}), 6000)
    return () => { dead = true; clearInterval(timer) }
  }, [load])

  useEffect(() => {
    if (!room || room.is_owner || room.status === 'ended') return
    const beat = () => api.liveAction({ action: 'heartbeat_viewer', stream_id: id }).catch(() => {})
    beat()
    const timer = setInterval(beat, 20000)
    return () => clearInterval(timer)
  }, [id, room?.is_owner, room?.status])

  useEffect(() => {
    const connection = connectLiveRealtime(id, {
      onState: setRealtimeState,
      onEvent: (event) => {
        if (event.type === 'viewer_count') {
          setRoom((current) => current ? { ...current, viewer_count: event.payload?.viewer_count ?? current.viewer_count } : current)
        } else if (event.type === 'likes') {
          setRoom((current) => current ? { ...current, likes: event.payload?.likes ?? current.likes } : current)
        } else if (event.type === 'stream_status') {
          setRoom((current) => current ? {
            ...current,
            status: event.payload?.status || current.status,
            media_status: event.payload?.media_status || current.media_status,
          } : current)
        } else if (event.type === 'support') {
          const payload = event.payload || {}
          const supporter = payload.supporter || {}
          const transaction = payload.transaction || {}
          const gift = payload.gift || {}
          const item = {
            id: transaction.id,
            gift_id: transaction.gift_id || gift.id,
            gross_amount: transaction.gross_amount,
            platform_fee: transaction.platform_fee,
            net_amount: transaction.net_amount,
            created_at: transaction.created_at || event.at,
            gift_name: gift.name,
            icon: gift.icon,
            supporter_id: supporter.id,
            supporter_username: supporter.username,
            supporter_full_name: supporter.full_name,
            supporter_avatar_url: supporter.avatar_url,
            supporter_role: supporter.role,
            supporter_company_suffix: supporter.company_suffix,
          }
          setRoom((current) => current ? {
            ...current,
            recent_support: item.id ? [item, ...(current.recent_support || []).filter((entry) => entry.id !== item.id)].slice(0, 25) : current.recent_support,
          } : current)
          load().catch(() => {})
        }
      },
    })
    return () => connection.close()
  }, [id, load])

  useEffect(() => {
    if (!isHost) return
    const publisher = getLivePublisher(id)
    if (!publisher) {
      if (room?.status !== 'ended') setPublisherConnection('disconnected')
      return
    }
    return publisher.subscribeConnection((state) => {
      setPublisherConnection(state)
      if (!['connected', 'disconnected', 'failed'].includes(state) || lastPublisherStateRef.current === state) return
      lastPublisherStateRef.current = state
      api.liveAction({ action: 'publisher_state', stream_id: id, state }).then(() => load()).catch(() => {})
    })
  }, [id, isHost, load, room?.status])

  async function likeLive() {
    if (room.liked_by_me) return
    try {
      const result = await api.liveAction({ action: 'like', stream_id: id })
      setRoom((current) => ({ ...current, likes: result.likes, liked_by_me: true }))
    } catch (err) { alert(err.message) }
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
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  async function endLive() {
    if (!confirm('End this Live?')) return
    setBusy(true)
    try {
      await clearLivePublisher(id)
      sessionStorage.removeItem(`chombutar-live-publisher:${id}`)
      await api.liveAction({ action: 'end_stream', stream_id: id })
      setPublisherConnection('ended')
      await load()
      await refreshUser()
    } catch (err) {
      setError(err.message || 'Could not end Live cleanly.')
    } finally {
      setBusy(false)
    }
  }

  function toggleTrack(kind) {
    const publisher = getLivePublisher(id)?.peerConnection
    const sender = publisher?.getSenders?.().find((item) => item.track?.kind === kind)
    if (!sender?.track) {
      setError('This browser no longer has the active Live capture session. Return to Live and start a new broadcast.')
      return
    }
    sender.track.enabled = !sender.track.enabled
    setLocalMedia((state) => ({ ...state, [kind === 'audio' ? 'mic' : 'camera']: sender.track.enabled }))
  }

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading Live…</p>
  if (error && !room) return <p className="text-center text-red-600 py-16 text-[13px] font-medium">{error}</p>
  if (!room) return <p className="text-center text-red-600 py-16 text-[13px] font-medium">Live not found.</p>

  const isLive = ['live', 'reconnecting'].includes(room.status)
  const feeRate = Number(room.platform_fee_bps || 0) / 100
  const giftAmount = selectedGift?.custom_amount ? Number(customAmount || 0) : Number(selectedGift?.amount || 0)
  const fee = Math.floor((giftAmount * Number(room.platform_fee_bps || 0)) / 10000)
  const playerMessage = playbackMessage(playbackState)

  return (
    <div className="max-w-[780px] mx-auto space-y-4 pb-10" ref={shellRef}>
      <div className="flex items-center gap-3">
        <Link to="/live" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center"><ArrowLeft size={15} /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-[16px] font-bold truncate">{room.title}</h1><p className="text-[11px] font-semibold text-black/45">{room.category}</p></div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isLive ? 'bg-red-600 text-white' : 'bg-black/10 text-black/60'}`}>{room.status === 'reconnecting' ? 'RECONNECTING…' : room.status.toUpperCase()}</span>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700">{error}</div>}

      <div className="relative aspect-video rounded-[22px] overflow-hidden bg-black border-[1.5px] border-black">
        {room.status === 'scheduled' || room.status === 'starting' ? <div className="w-full h-full grid place-items-center text-white/70 text-[13px] font-semibold">Talent is preparing the Live</div>
          : room.status === 'ended' ? <div className="w-full h-full grid place-items-center text-white/70 text-[13px] font-semibold">Live has ended</div>
            : room.status === 'failed' ? <div className="w-full h-full grid place-items-center text-red-300 text-[13px] font-semibold">Live stream failed</div>
              : <StreamPlayer src={room.hls_url} quality={quality} onState={setPlaybackState} />}
        {playerMessage && isLive && <div className="absolute left-3 bottom-3 rounded-full bg-black/70 text-white px-3 py-1.5 text-[10px] font-bold">{playerMessage}</div>}
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
        {isHost && <p className={`text-[11px] font-bold ${publisherConnection === 'failed' ? 'text-red-600' : 'text-black/50'}`}>{publisherLabel(publisherConnection)}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold"><Wifi size={13} /><span>Quality</span>{[['auto','Auto'],['data_saver','Data Saver'],['high','High Quality']].map(([value,label]) => <button key={value} onClick={() => setQuality(value)} className={`px-3 py-1.5 rounded-full border ${quality === value ? 'bg-black text-white border-black' : 'border-black/15'}`}>{label}</button>)}<span className="text-[9px] text-black/35 ml-auto">{realtimeState === 'connected' ? 'Live updates connected' : 'Live updates via polling'}</span></div>
      </div>

      {isHost && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[
        ['Today’s Live Earnings', money(room.earnings?.today_net_earnings)], ['Total Gifts', room.earnings?.total_gifts || 0], ['Gross Support', money(room.earnings?.gross_support)], ['Platform Fee', money(room.earnings?.platform_fee)]
      ].map(([label,value]) => <div key={label} className="rounded-[18px] border border-black/10 bg-white p-3"><p className="text-[10px] font-bold text-black/45">{label}</p><p className="text-[16px] font-bold mt-1">{value}</p></div>)}</div>}

      {isHost && room.gift_breakdown?.length > 0 && <section className="bg-white rounded-[20px] border border-black/10 p-4"><h2 className="text-[13px] font-bold mb-3">Gift Breakdown</h2><div className="flex flex-wrap gap-2">{room.gift_breakdown.map((gift) => <div key={gift.id} className="rounded-full bg-black/[0.04] px-3 py-2 text-[11px] font-semibold">{gift.icon} {gift.name} × {gift.count} · {money(gift.gross_amount)}</div>)}</div></section>}

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="bg-white rounded-[20px] border border-black/10 p-4">
          <h2 className="text-[13px] font-bold mb-3">Recent Support</h2>
          <div className="space-y-3">{(room.recent_support || []).map((support) => <div key={support.id} className="flex items-center justify-between gap-3"><UserIdentity user={supportIdentity(support)} layout="inline" avatarClassName="w-7 h-7" nameClassName="font-bold text-[11px]" usernameClassName="text-[10px] font-semibold text-black/45" /><span className="shrink-0 text-[10px] font-semibold text-black/55">{support.icon} {support.gift_name} · {money(support.gross_amount)}</span></div>)}{!room.recent_support?.length && <p className="text-[11px] text-black/40">No support yet.</p>}</div>
        </section>
        <section className="bg-white rounded-[20px] border border-black/10 p-4">
          <h2 className="text-[13px] font-bold mb-3">Top Supporters</h2>
          <div className="space-y-3">{(room.top_supporters || []).map((supporter,index) => <div key={supporter.id} className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><span className="text-[10px] font-bold text-black/40">{index+1}.</span><UserIdentity user={supporter} layout="inline" avatarClassName="w-7 h-7" nameClassName="font-bold text-[11px]" usernameClassName="text-[10px] font-semibold text-black/45" /></div><span className="shrink-0 text-[10px] font-bold">{money(supporter.amount)}</span></div>)}{!room.top_supporters?.length && <p className="text-[11px] text-black/40">No supporters yet.</p>}</div>
        </section>
      </div>

      {supportOpen && <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={() => setSupportOpen(false)}><div className="w-full sm:max-w-[520px] max-h-[82vh] overflow-y-auto rounded-t-[26px] sm:rounded-[26px] bg-white p-4" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="text-[16px] font-bold">Support Talent</h2><p className="text-[11px] text-black/45 font-medium">Real wallet support, credited to the Talent’s withdrawable balance.</p></div><button onClick={() => setSupportOpen(false)} className="text-[12px] font-bold">Close</button></div><div className="grid grid-cols-2 gap-2 mt-4">{(room.gifts || []).map((gift) => <button key={gift.id} onClick={() => setSelectedGift(gift)} className={`text-left rounded-[16px] border p-3 ${selectedGift?.id === gift.id ? 'border-[#0A13E6] bg-blue-50' : 'border-black/10'}`}><div className="text-[20px]">{gift.icon}</div><div className="text-[12px] font-bold mt-1">{gift.name}</div><div className="text-[10px] text-black/45 mt-0.5">{gift.custom_amount ? 'Custom amount' : money(gift.amount)}</div></button>)}</div>{selectedGift && <div className="mt-4 rounded-[18px] bg-black/[0.03] p-3 space-y-2"><p className="text-[12px] font-bold">{selectedGift.icon} {selectedGift.name}</p><p className="text-[11px] text-black/55">{selectedGift.description}</p>{selectedGift.custom_amount && <input type="number" min="100" max="10000000" step="100" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="Enter amount" className="w-full h-10 rounded-xl border border-black/15 px-3 text-[12px]" />}<div className="flex justify-between text-[11px]"><span>Amount</span><b>{money(giftAmount)}</b></div><div className="flex justify-between text-[11px]"><span>Platform fee ({feeRate}%)</span><b>{money(fee)}</b></div><div className="flex justify-between text-[11px]"><span>Talent receives</span><b>{money(Math.max(0, giftAmount-fee))}</b></div><button onClick={sendSupport} disabled={busy || giftAmount < 100} className="w-full h-11 rounded-full bg-[#0A13E6] text-white text-[12px] font-bold disabled:opacity-40">Confirm Support</button></div>}</div></div>}
    </div>
  )
}
