// Path: src/pages/Live/LiveHub.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Swords, Mic, Trophy, Radio } from 'lucide-react'
import { api } from '../../lib/api'

export default function LiveHub() {
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    let cancelled = false
    api
      .getLiveLeaderboard()
      .then((data) => {
        if (!cancelled) setLeaderboard(data.leaderboard || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 max-w-[760px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight flex items-center gap-2">
          <Radio size={20} className="text-[#0A13E6]" /> Chombutar Live
        </h1>
        <p className="text-[12px] text-black/50 font-medium mt-0.5">
          Where talent competes and performs — using Orbit Coins from your existing wallet.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          to="/live/arena"
          className="group bg-white rounded-[24px] border-[1.5px] border-black p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition"
        >
          <div className="w-11 h-11 rounded-full bg-black text-white grid place-items-center mb-4">
            <Swords size={18} />
          </div>
          <h2 className="text-[17px] font-bold tracking-tight">1V1 Arena</h2>
          <p className="text-[12px] text-black/50 font-medium mt-1">
            Enter one-on-one challenge with other Talents.
          </p>
          <p className="mt-3 text-[12px] font-semibold text-[#0A13E6] group-hover:underline">Enter the Arena →</p>
        </Link>

        <Link
          to="/live/stage"
          className="group bg-white rounded-[24px] border-[1.5px] border-black p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition"
        >
          <div className="w-11 h-11 rounded-full bg-[#0A13E6] text-white grid place-items-center mb-4">
            <Mic size={18} />
          </div>
          <h2 className="text-[17px] font-bold tracking-tight">SLive tage </h2>
          <p className="text-[12px] text-black/50 font-medium mt-1">
            Sing, dance, or talk to a live 3D-style hall. Likes and gifts build your Orbit Score.
          </p>
          <p className="mt-3 text-[12px] font-semibold text-[#0A13E6] group-hover:underline">Go to the Stage →</p>
        </Link>
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black overflow-hidden">
        <div className="px-5 py-3 border-b-[1.5px] border-black flex items-center gap-2">
          <Trophy size={14} className="text-[#8A6D00]" />
          <h3 className="text-[13px] font-bold tracking-tight">Orbit Score leaderboard</h3>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-center py-8 text-black/40 text-[13px] font-medium">No Stage scores yet — be the first.</p>
        ) : (
          <ul className="divide-y divide-black/10">
            {leaderboard.map((row, i) => (
              <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 text-[12px] font-bold text-black/40">{i + 1}</span>
                <img
                  src={row.avatar_url || '/logo.png'}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border-[1.5px] border-black/10"
                />
                <span className="flex-1 text-[13px] font-semibold truncate">{row.full_name || `@${row.username}`}</span>
                <span className="text-[13px] font-bold text-[#0A13E6]">{row.live_orbit_score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
