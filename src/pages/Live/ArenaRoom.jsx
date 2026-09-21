// Path: src/pages/Live/ArenaRoom.jsx
import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Swords, Trophy, ShieldAlert, Users, Timer } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import UserIdentity, { ProfileLink } from '../../components/UserIdentity'
import { getPrimaryIdentity, getSecondaryIdentity } from '../../lib/profile.js'

function fmtCoins(n) {
  return `${Number(n || 0).toLocaleString()} Coins`
}

export default function ArenaRoom() {
  const { id } = useParams()
  const { user, refreshUser } = useAuth()
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.getLiveRoom(id)
    setRoom(data)
  }, [id])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((e) => !cancelled && setError(e.message || 'Failed to load room'))
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

  if (loading) return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading match…</p>
  if (error || !room) return <p className="text-center text-red-600 py-16 text-[13px] font-medium">{error || 'Room not found'}</p>

  const players = room.players || []
  const isPlayer = players.some((p) => p.id === user.id)
  const isHost = room.host_id === user.id
  const otherPlayer = players.find((p) => p.id !== user.id)
  const winner = players.find((p) => p.id === room.winner_id)
  const canJoin = room.status === 'open' && !isPlayer && (!room.invited_user_id || room.invited_user_id === user.id)
  const canBack = ['open', 'live'].includes(room.status) && !isPlayer && !room.my_bet
  const canReport = room.status === 'live' && isPlayer
  const canRespond = room.status === 'reported' && isPlayer
  const canCancel = room.status === 'open' && isHost

  async function handleReport() {
    if (!otherPlayer) return alert('Waiting for an opponent first.')
    if (!confirm(`Report ${getPrimaryIdentity(otherPlayer)} as the winner? Reporting yourself as winner is also possible if you won.`)) return
    const winnerChoice = confirm('Click OK if the OPPONENT won, or Cancel if YOU won.')
    await act('report_result', { winner_id: winnerChoice ? otherPlayer.id : user.id })
  }

  async function handleBack() {
    if (!otherPlayer) return alert('Wait for both players before backing one.')
    const target = confirm(`Click OK to back ${getPrimaryIdentity(players[0])}, or Cancel to back ${getPrimaryIdentity(players[1])}.`)
      ? players[0]
      : players[1]
    const input = prompt(`How many Orbit Coins do you want to back ${getPrimaryIdentity(target)} with?`)
    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0) return
    await act('back_player', { backing_user_id: target.id, amount })
  }

  async function handleDispute() {
    const reason = prompt('What are you disputing about this result?')
    if (!reason) return
    await act('dispute_result', { reason })
  }

  return (
    <div className="space-y-5 max-w-[620px] mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/live/arena" className="w-9 h-9 rounded-full border-[1.5px] border-black grid place-items-center hover:bg-black hover:text-white transition">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-[18px] font-bold tracking-tight flex items-center gap-2">
            <Swords size={16} /> {room.title}
          </h1>
          <p className="text-[12px] text-black/50 font-medium">{room.game_name} · Stake {fmtCoins(room.stake)} each</p>
        </div>
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((slot) => {
            const p = players[slot]
            return (
              <div key={slot} className={`rounded-[14px] border-[1.5px] p-3 text-center ${room.winner_id && p?.id === room.winner_id ? 'border-[#0A13E6] bg-[#0A13E6]/5' : 'border-black/10'}`}>
                {p ? (
                  <>
                    <ProfileLink user={p} ariaLabel={`View ${getPrimaryIdentity(p)}'s profile`} className="block w-fit mx-auto rounded-full">
                      <img src={p.avatar_url || '/logo.png'} alt="" className="w-12 h-12 rounded-full object-cover mx-auto border-[1.5px] border-black/10" />
                    </ProfileLink>
                    <p className="mt-2 text-[13px] font-bold truncate">
                      <ProfileLink user={p} className="hover:underline">{getPrimaryIdentity(p)}</ProfileLink>
                    </p>
                    {getSecondaryIdentity(p) && (
                      <p className="text-[11px] font-semibold text-black/50 truncate">
                        <ProfileLink user={p} className="hover:underline">{getSecondaryIdentity(p)}</ProfileLink>
                      </p>
                    )}
                    {room.winner_id === p.id && <p className="text-[11px] text-[#0A13E6] font-semibold flex items-center gap-1 justify-center mt-0.5"><Trophy size={11} /> Winner</p>}
                  </>
                ) : (
                  <p className="text-[12px] text-black/40 font-medium py-6">Waiting for opponent…</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between text-[12px] text-black/50 font-medium border-t-[1.5px] border-black/10 pt-3">
          <span className="flex items-center gap-1.5"><Users size={12} /> Pot: {fmtCoins(room.pot)}</span>
          <span>Backing pool: {fmtCoins(room.backing?.pool)} ({room.backing?.backers || 0})</span>
        </div>

        {room.status === 'reported' && (
          <div className="rounded-[12px] bg-[#FFF6DB] text-[#8A6D00] px-4 py-3 text-[12px] font-medium flex items-center gap-2">
            <Timer size={14} /> A result was reported. It auto-settles after a {room.dispute_window_seconds}s dispute window unless the opponent disputes it.
          </div>
        )}
        {room.status === 'disputed' && (
          <div className="rounded-[12px] bg-red-50 text-red-700 px-4 py-3 text-[12px] font-medium flex items-center gap-2">
            <ShieldAlert size={14} /> Under dispute — an admin will review and settle this match.
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 pt-1">
          {canJoin && (
            <button onClick={() => act('join_room')} disabled={busy} className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
              Join match & lock stake
            </button>
          )}
          {canBack && (
            <button onClick={handleBack} disabled={busy} className="h-10 px-4 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black hover:bg-black hover:text-white transition disabled:opacity-50">
              Back a player
            </button>
          )}
          {canReport && (
            <button onClick={handleReport} disabled={busy} className="h-10 px-4 rounded-full bg-black text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
              Report result
            </button>
          )}
          {canRespond && (
            <>
              <button onClick={() => act('confirm_result')} disabled={busy} className="h-10 px-4 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black disabled:opacity-50">
                Confirm result
              </button>
              <button onClick={handleDispute} disabled={busy} className="h-10 px-4 rounded-full bg-white text-red-600 text-[13px] font-semibold border-[1.5px] border-red-300 disabled:opacity-50">
                Dispute
              </button>
            </>
          )}
          {canCancel && (
            <button onClick={() => act('cancel_room')} disabled={busy} className="h-10 px-4 rounded-full bg-white text-black text-[13px] font-semibold border-[1.5px] border-black/20 disabled:opacity-50">
              Cancel & refund
            </button>
          )}
          {room.my_bet && (
            <span className="h-10 px-4 rounded-full bg-black/5 text-black/60 text-[12px] font-semibold flex items-center">
              You backed <UserIdentity user={players.find((p) => p.id === room.my_bet.backing_user_id)} layout="inline" showAvatar={false} fallbackLabel="a player" nameClassName="font-semibold text-black/70" usernameClassName="font-semibold text-black/50" /> with {fmtCoins(room.my_bet.amount)}
            </span>
          )}
        </div>
      </div>

      {room.status === 'completed' && winner && (
        <div className="bg-white rounded-[20px] border-[1.5px] border-black p-5 text-center">
          <Trophy size={22} className="mx-auto text-[#8A6D00]" />
          <p className="mt-2 text-[14px] font-bold"><UserIdentity user={winner} layout="inline" showAvatar={false} nameClassName="font-bold" usernameClassName="font-semibold text-black/50" /> won {fmtCoins(room.pot)}!</p>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">75% to the winner, 15% to Combutar, 10% to the game owner.</p>
        </div>
      )}
    </div>
  )
}
