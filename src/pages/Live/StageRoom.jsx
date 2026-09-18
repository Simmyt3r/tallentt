// Path: src/pages/Live/StageRoom.jsx
import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mic, Heart, Gift as GiftIcon, Swords, Megaphone, Wifi, Radio } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

function fmtCoins(n) {
  return `${Number(n || 0).toLocaleString()}`
}

// Preset gift catalog — amounts in Orbit Coins. Kept client-side; the
// server only validates gift_type is a short string and amount is a
// positive integer (see api/_lib/live.js sendGift), so this list is purely
// UI, not a source of truth.
const GIFTS = [
  { type: 'clap', label: '👏 Clap', amount: 50 },
  { type: 'rose', label: '🌹 Rose', amount: 150 },
  { type: 'crown', label: '👑 Crown', amount: 500 },
  { type: 'diamond', label: '💎 Diamond', amount: 2000 },
]

const PLACEMENT_LABELS = {
  led_ribbon: 'LED ribbon',
  side_poster_left: 'Left poster',
  side_poster_right: 'Right poster',
  roof_screen: 'Roof screen',
  seats: 'Seats',
}

export default function StageRoom() {
  const { id } = useParams()
  const { user, refreshUser } = useAuth()
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)
  const [sponsorForm, setSponsorForm] = useState({ placement: 'led_ribbon', brand_name: '', message: '', rain_amount: '' })

  const load = useCallback(async () => {
    const data = await api.getLiveRoom(id)
    setRoom(data)
  }, [id])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((e) => !cancelled && setError(e.message || 'Failed to load stage'))
      .finally(() => !cancelled && setLoading(false))
    const interval = setInterval(() => load().catch(() => {}), 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [load])

  async function act(action, extra = {}) {
    setBusy(true)
    try {
      await api.liveAction({ action, room_id: id, ...extra })
      await load()
      await refreshUser()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleGift(gift) {
    await act('send_gift', { gift_type: gift.type, amount: gift.amount })
  }

  async function handleChallenge() {
    const username = prompt('Challenge who? Enter their @username:')
    if (!username) return
    const game = prompt('Which game — chess, draughts, ludo, or codm?', 'chess')
    if (!game) return
    const stakeInput = prompt('Stake per player (Orbit Coins):', '500')
    const stake = Number(stakeInput)
    if (!Number.isFinite(stake) || stake <= 0) return
    setBusy(true)
    try {
      const { room: arenaRoom } = await api.liveAction({
        action: 'challenge', room_id: id, target_username: username.replace(/^@/, ''), game, stake, title: `Challenge from Stage`,
      })
      await refreshUser()
      window.location.href = `/live/arena/${arenaRoom.id}`
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  async function handleSponsorSubmit(e) {
    e.preventDefault()
    if (!sponsorForm.brand_name.trim()) return alert('Enter a brand name.')
    setBusy(true)
    try {
      await api.liveAction({
        action: 'rent_sponsor_slot',
        room_id: id,
        placement: sponsorForm.placement,
        brand_name: sponsorForm.brand_name.trim(),
        message: sponsorForm.message.trim() || undefined,
        rain_amount: sponsorForm.rain_amount ? Number(sponsorForm.rain_amount) : undefined,
      })
      setSponsorOpen(false)
      setSponsorForm({ placement: 'led_ribbon', brand_name: '', message: '', rain_amount: '' })
      await load()
      await refreshUser()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading stage…</p>
  if (error || !room) return <p className="text-center text-red-600 py-16 text-[13px] font-medium">{error || 'Room not found'}</p>

  const isHost = room.host_id === user.id
  const isLive = room.status === 'live'
  const sponsorByPlacement = Object.fromEntries((room.sponsors || []).map((s) => [s.placement, s]))

  return (
    <div className="space-y-5 max-w-[700px] mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/live/stage" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center hover:bg-black hover:text-white transition">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1">
          <h1 className="text-[17px] font-bold tracking-tight flex items-center gap-2">
            <Mic size={16} /> {room.title}
          </h1>
          <p className="text-[12px] text-black/50 font-medium">{room.host_full_name || `@${room.host_username}`} · Orbit Score {room.host_live_orbit_score}</p>
        </div>
        {isLive && (
          <span className="text-[10px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-full flex items-center gap-1">
            <Wifi size={10} /> LIVE
          </span>
        )}
      </div>

      {/* Stylized "3D hall" — a real WebGL/3D venue would live here; this is
          a CSS approximation of the described layout (LED ribbon, side
          posters, roof screen, seats) with real Sponsor Hall data. */}
      <div className="relative rounded-[24px] border-[1.5px] border-black overflow-hidden bg-gradient-to-b from-[#0b0b12] to-[#1a1a2b] p-5 text-white" style={{ perspective: '800px' }}>
        <div className="text-center text-[10px] font-bold tracking-widest uppercase text-white/50 mb-1">
          {sponsorByPlacement.roof_screen ? `📺 ${sponsorByPlacement.roof_screen.brand_name}` : 'Roof screen — available to sponsor'}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-1 items-center justify-center text-[10px] font-semibold text-white/60 border border-white/10 rounded-[10px] py-8 rotate-y-[-8deg]" style={{ writingMode: 'vertical-rl' }}>
            {sponsorByPlacement.side_poster_left ? sponsorByPlacement.side_poster_left.brand_name : 'Poster'}
          </div>
          <div className="flex-[3] text-center py-6">
            <img src={room.host_avatar_url || '/logo.png'} alt="" className="w-20 h-20 rounded-full mx-auto border-2 border-white/70 object-cover shadow-lg" />
            <p className="mt-2 text-[13px] font-bold">{room.host_full_name || `@${room.host_username}`}</p>
          </div>
          <div className="hidden sm:flex flex-1 items-center justify-center text-[10px] font-semibold text-white/60 border border-white/10 rounded-[10px] py-8" style={{ writingMode: 'vertical-rl' }}>
            {sponsorByPlacement.side_poster_right ? sponsorByPlacement.side_poster_right.brand_name : 'Poster'}
          </div>
        </div>
        <div className="mt-2 text-center text-[10px] font-bold tracking-widest uppercase bg-white/10 rounded-full py-1.5 overflow-hidden whitespace-nowrap">
          {sponsorByPlacement.led_ribbon ? `✨ ${sponsorByPlacement.led_ribbon.brand_name}${sponsorByPlacement.led_ribbon.message ? ` — ${sponsorByPlacement.led_ribbon.message}` : ''} ✨` : 'LED ribbon — available to sponsor'}
        </div>
        <div className="mt-3 grid grid-cols-8 gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className={`h-2 rounded-sm ${sponsorByPlacement.seats ? 'bg-[#0A13E6]/70' : 'bg-white/15'}`} />
          ))}
        </div>
        {sponsorByPlacement.seats && (
          <p className="text-center text-[10px] text-white/50 mt-1">Seats sponsored by {sponsorByPlacement.seats.brand_name}</p>
        )}
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black p-4 flex flex-wrap items-center gap-2.5">
        <button onClick={() => act('like')} disabled={busy || room.liked_by_me} className="h-10 px-4 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black flex items-center gap-1.5 disabled:opacity-50">
          <Heart size={14} className={room.liked_by_me ? 'fill-red-500 text-red-500' : ''} /> {room.likes}
        </button>
        {!isHost && isLive && (
          <>
            {GIFTS.map((g) => (
              <button key={g.type} onClick={() => handleGift(g)} disabled={busy} className="h-10 px-3 rounded-full bg-white text-black text-[12px] font-semibold border-[1.5px] border-black/20 hover:border-black disabled:opacity-50">
                {g.label} · {g.amount}
              </button>
            ))}
          </>
        )}
        {isHost && isLive && (
          <>
            <button onClick={handleChallenge} disabled={busy} className="h-10 px-4 rounded-full bg-black text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center gap-1.5 disabled:opacity-50">
              <Swords size={14} /> Challenge a viewer
            </button>
            <button onClick={() => act('end_stage')} disabled={busy} className="h-10 px-4 rounded-full bg-white text-red-600 text-[13px] font-semibold border-[1.5px] border-red-300 disabled:opacity-50">
              End stage
            </button>
          </>
        )}
        {isLive && (
          <button onClick={() => setSponsorOpen(true)} disabled={busy} className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center gap-1.5 ml-auto disabled:opacity-50">
            <Megaphone size={14} /> Sponsor this hall
          </button>
        )}
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black overflow-hidden">
        <div className="px-4 py-2.5 border-b-[1.5px] border-black flex items-center gap-2">
          <GiftIcon size={13} />
          <h3 className="text-[12px] font-bold tracking-tight">Recent gifts</h3>
        </div>
        {(room.recent_gifts || []).length === 0 ? (
          <p className="text-center py-6 text-black/40 text-[12px] font-medium">No gifts yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 max-h-[220px] overflow-y-auto">
            {room.recent_gifts.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-2 text-[12px]">
                <span className="font-semibold truncate">{g.full_name || `@${g.username}`}</span>
                <span className="text-black/50">{g.gift_type} · {fmtCoins(g.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sponsorOpen && (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-5" onClick={() => setSponsorOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSponsorSubmit}
            className="bg-white rounded-[24px] border-[1.5px] border-black p-6 w-full max-w-[420px] shadow-[0_24px_60px_rgba(0,0,0,0.2)] space-y-4"
          >
            <div>
              <h2 className="text-[16px] font-bold tracking-tight flex items-center gap-2"><Radio size={15} /> Sponsor this hall</h2>
              <p className="text-[12px] text-black/50 font-medium mt-1">Rent a placement, optionally rain Orbit Coins on the audience.</p>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Placement</label>
              <select
                value={sponsorForm.placement}
                onChange={(e) => setSponsorForm((f) => ({ ...f, placement: e.target.value }))}
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none"
              >
                {Object.entries(PLACEMENT_LABELS).map(([code, label]) => (
                  <option key={code} value={code} disabled={Boolean(sponsorByPlacement[code])}>
                    {label} {sponsorByPlacement[code] ? '(taken)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Brand name</label>
              <input
                value={sponsorForm.brand_name}
                onChange={(e) => setSponsorForm((f) => ({ ...f, brand_name: e.target.value }))}
                placeholder="e.g. Orbit Sneakers"
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-[#0A13E6]/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Ribbon / poster message (optional)</label>
              <input
                value={sponsorForm.message}
                onChange={(e) => setSponsorForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="e.g. 20% off this weekend"
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Rain on audience (optional, Orbit Coins)</label>
              <input
                type="number"
                min="0"
                value={sponsorForm.rain_amount}
                onChange={(e) => setSponsorForm((f) => ({ ...f, rain_amount: e.target.value }))}
                placeholder="0"
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none"
              />
              <p className="mt-1.5 text-[11px] text-black/40 font-medium">Split evenly among everyone who has liked or gifted this stage so far.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setSponsorOpen(false)} className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="flex-1 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
                {busy ? 'Renting…' : 'Rent placement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
