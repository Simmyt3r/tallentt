// Path: src/pages/Live/ArenaHall.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Swords, Plus, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// Co-located per the codebase's existing pattern (see Wallet.jsx).
function fmtCoins(n) {
  return `${Number(n || 0).toLocaleString()} Coins`
}

const STATUS_LABEL = {
  open: 'Waiting for opponent',
  live: 'Match live',
  reported: 'Result reported',
  disputed: 'Under dispute',
  completed: 'Completed',
}
const STATUS_STYLE = {
  open: 'bg-[#FFF6DB] text-[#8A6D00]',
  live: 'bg-[#E8FFE6] text-[#0A7A00]',
  reported: 'bg-[#EDEBFF] text-[#3B2FD9]',
  disputed: 'bg-red-50 text-red-600',
  completed: 'bg-black/5 text-black/50',
}

export default function ArenaHall() {
  const { user, refreshUser } = useAuth()
  const [rooms, setRooms] = useState([])
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', game: 'chess', stake: '' })

  async function reload() {
    const data = await api.getLiveRooms('arena')
    setRooms(data.rooms || [])
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getLiveRooms('arena'), api.getLiveGames()])
      .then(([roomsData, gamesData]) => {
        if (cancelled) return
        setRooms(roomsData.rooms || [])
        setGames(gamesData.games || [])
        setForm((f) => ({ ...f, game: gamesData.games?.[0]?.code || 'chess' }))
      })
      .catch((e) => !cancelled && setError(e.message || 'Failed to load Arena Hall'))
      .finally(() => !cancelled && setLoading(false))
    const interval = setInterval(() => reload().catch(() => {}), 8000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    const stake = Number(form.stake)
    if (!form.title.trim()) return alert('Give the room a title.')
    if (!Number.isFinite(stake) || stake <= 0) return alert('Enter a valid stake.')
    setBusy(true)
    try {
      await api.liveAction({ action: 'create_room', hall: 'arena', title: form.title.trim(), game: form.game, stake })
      setCreateOpen(false)
      setForm({ title: '', game: form.game, stake: '' })
      await reload()
      await refreshUser()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading Arena Hall…</p>

  return (
    <div className="space-y-5 max-w-[720px] mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/live" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center hover:bg-black hover:text-white transition">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1">
          <h1 className="text-[20px] font-bold tracking-tight flex items-center gap-2">
            <Swords size={17} /> 1V1 Arena
          </h1>
          <p className="text-[12px] text-black/50 font-medium">1v1 competitions — back who you think will win.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center gap-1.5"
        >
          <Plus size={14} /> Create room
        </button>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</div>
      )}

      {rooms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[20px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 text-[13px] font-medium">No matches yet. Be the first to create one.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                to={`/live/arena/${room.id}`}
                className="block bg-white rounded-[20px] border-[1.5px] border-black p-4 hover:-translate-y-0.5 transition shadow-[0_6px_18px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold tracking-widest uppercase text-black/40">{room.game_name}</span>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[room.status] || ''}`}>
                    {STATUS_LABEL[room.status] || room.status}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold tracking-tight truncate">{room.title}</h3>
                <div className="mt-2 flex items-center justify-between text-[12px] text-black/50 font-medium">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {room.players?.length || 0}/2 · Pot {fmtCoins(room.pot)}
                  </span>
                  <span>{room.backing?.backers || 0} backing</span>
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
              <h2 className="text-[16px] font-bold tracking-tight">Create a competition room</h2>
              <p className="text-[12px] text-black/50 font-medium mt-1">
                Your stake locks from your wallet ({fmtCoins(user?.walletBalance)} available) the moment you create the room.
              </p>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Room title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chess for the crown"
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-[#0A13E6]/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Game</label>
              <select
                value={form.game}
                onChange={(e) => setForm((f) => ({ ...f, game: e.target.value }))}
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none"
              >
                {games.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name} {g.verification === 'engine' ? '(auto-verified)' : '(referee + 30s dispute window)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase text-black/50">Stake (Orbit Coins)</label>
              <input
                type="number"
                min="1"
                value={form.stake}
                onChange={(e) => setForm((f) => ({ ...f, stake: e.target.value }))}
                placeholder="500"
                className="mt-1.5 w-full h-11 rounded-[12px] border-[1.5px] border-black px-3.5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-[#0A13E6]/30"
              />
              <p className="mt-1.5 text-[11px] text-black/40 font-medium">
                Winner takes 75% of the pot, Combutar takes 15% for hosting, and the game's owner takes 10%.
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 h-11 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="flex-1 h-11 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
                {busy ? 'Creating…' : 'Create & lock stake'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
