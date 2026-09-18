// Path: src/pages/Live/StageHall.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mic, Plus, Heart, Gift as GiftIcon, Wifi } from 'lucide-react'
import { api } from '../../lib/api'

export default function StageHall() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', audio_only: false })

  async function reload() {
    const data = await api.getLiveRooms('stage')
    setRooms(data.rooms || [])
  }

  useEffect(() => {
    let cancelled = false
    reload()
      .catch((e) => !cancelled && setError(e.message || 'Failed to load Stage Hall'))
      .finally(() => !cancelled && setLoading(false))
    const interval = setInterval(() => reload().catch(() => {}), 8000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) return alert('Give your stage a title.')
    setBusy(true)
    try {
      const { room } = await api.liveAction({ action: 'create_room', hall: 'stage', title: form.title.trim(), audio_only: form.audio_only })
      setCreateOpen(false)
      window.location.href = `/live/stage/${room.id}`
    } catch (err) {
      alert(err.message)
      setBusy(false)
    }
  }

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading Live Hall…</p>

  return (
    <div className="space-y-5 max-w-[760px] mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/live" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center hover:bg-black hover:text-white transition">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1">
          <h1 className="text-[20px] font-bold tracking-tight flex items-center gap-2">
            <Mic size={17} /> Live Stage
          </h1>
          <p className="text-[12px] text-black/50 font-medium">Perform live — likes and gifts build your Orbit Score.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center gap-1.5"
        >
          <Plus size={14} /> Go live
        </button>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</div>
      )}

      {rooms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[20px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 text-[13px] font-medium">Nobody's live right now — be the first.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                to={`/live/stage/${room.id}`}
                className="block bg-white rounded-[20px] border-[1.5px] border-black overflow-hidden hover:-translate-y-0.5 transition shadow-[0_6px_18px_rgba(0,0,0,0.05)]"
              >
                <div className="h-24 bg-gradient-to-br from-black to-[#0A13E6] relative flex items-center justify-center">
                  {room.status === 'live' && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Wifi size={10} /> LIVE
                    </span>
                  )}
                  <img src={room.host_avatar_url || '/logo.png'} alt="" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
                </div>
                <div className="p-3.5">
                  <h3 className="text-[14px] font-bold tracking-tight truncate">{room.title}</h3>
                  <p className="text-[12px] text-black/50 font-medium mt-0.5">{room.host_full_name || `@${room.host_username}`}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-black/50 font-medium">
                    <span className="flex items-center gap-1"><Heart size={11} /> {room.likes}</span>
                    <span className="flex items-center gap-1"><GiftIcon size={11} /> {room.gifts?.count || 0}</span>
                    <span className="ml-auto font-bold text-[#0A13E6]">Orbit {room.host_live_orbit_score}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-5" onClick={() => setCreateOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
            className="bg-white rounded-[24px] border-[1.5px] border-black p-6 w-full max-w-[400px] shadow-[0_24px_60px_rgba(0,0,0,0.2)] space-y-4"
          >
            <div>
              <h2 className="text-[16px] font-bold tracking-tight">Go live on Stage</h2>
              <p className="text-[12px] text-black/50 font-medium mt-1">Sing, dance, or talk — the audience can like, gift, and challenge you.</p>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Stage title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Friday night freestyle"
                autoFocus
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-[#0A13E6]/30"
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] font-medium text-black/70">
              <input type="checkbox" checked={form.audio_only} onChange={(e) => setForm((f) => ({ ...f, audio_only: e.target.checked }))} />
              Start in Audio-Only mode (~150MB/hr instead of ~1.5GB/hr)
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="flex-1 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
                {busy ? 'Starting…' : 'Go live'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
