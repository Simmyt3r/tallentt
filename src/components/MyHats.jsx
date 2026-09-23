import { useEffect, useState } from 'react'
import { LayoutGrid, List, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import BentoCard from './BentoCard'
import HatFeedToggle from './HatFeedToggle'
import { Link } from 'react-router-dom'
import { cldImage, cldVideoPoster } from '../lib/cloudinary'
import UserIdentity from './UserIdentity'
import { identityFromHat } from '../lib/profile.js'

export default function MyHats() {
  const { user } = useAuth()
  const [hats, setHats] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('chombutar_viewMode') || 'grid')
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getHats({ user_id: user.id })
        if (!cancelled) setHats(data.hats || [])
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  function setMode(m) {
    setViewMode(m)
    localStorage.setItem('chombutar_viewMode', m)
  }

  function handleHatChange(patch) {
    setHats((prev) => prev.map((hat) => hat.id === patch.id ? { ...hat, ...patch } : hat))
  }

  async function handleDelete(id) {
    if (!confirm('Delete this hat?')) return
    try {
      await api.deleteHat(id)
      setHats((prev) => prev.filter((h) => h.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading your hats…</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">My Hats</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">{hats.length} hat{hats.length !== 1 ? 's' : ''}</p>
          <p className="text-[12px] text-black/50 mt-1">Choose which Hats appear in the Bento feed. Range pricing requires a fee notice confirmation.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-white border-[1.5px] border-black p-0.5">
            <button
              type="button"
              onClick={() => setMode('grid')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                viewMode === 'grid' ? 'bg-[#0A13E6] text-white' : 'text-black/50'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMode('list')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                viewMode === 'list' ? 'bg-[#0A13E6] text-white' : 'text-black/50'
              }`}
            >
              <List size={16} />
            </button>
          </div>
          <Link
            to="/create"
            className="h-10 px-5 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black shadow-[0_4px_12px_rgba(10,19,230,0.25)] hover:bg-black transition flex items-center"
          >
            + New Hat
          </Link>
        </div>
      </div>

      {hats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 mb-4 text-[13px] font-medium">You haven’t created any hats yet.</p>
          <Link
            to="/create"
            className="inline-flex h-11 px-6 rounded-full bg-[#0A13E6] text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
          >
            Create your first Hat
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="hats-grid">
          {hats.map((h) => (
            <div key={h.id} className="relative group space-y-2">
              <div className="relative">
                <BentoCard hat={h} onHatChange={handleHatChange} />
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <Link
                    to={`/create?edit=${h.id}`}
                    className="w-8 h-8 bg-white rounded-full shadow border-[1.5px] border-black flex items-center justify-center hover:bg-black hover:text-white transition"
                  >
                    <Pencil size={13} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id)}
                    className="w-8 h-8 bg-white rounded-full shadow border-[1.5px] border-black flex items-center justify-center text-red-600 hover:bg-red-600 hover:text-white transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <HatFeedToggle hat={h} onChange={handleHatChange} />
            </div>
          ))}
        </div>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {hats.map((h) => (
            <li key={h.id} className="hover:bg-[#F5F3EF]/50 transition">
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                  {h.media?.[0]?.url &&
                    (h.media[0].type === 'video' ? (
                      <img src={cldVideoPoster(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <img src={cldImage(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] truncate">{h.hat_title}</p>
                  <p className="text-[12px] text-black/50">
                    <UserIdentity user={identityFromHat(h)} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/70" usernameClassName="font-semibold text-black/50" /> · {h.category} · {h.role}
                  </p>
                </div>
                <span className="text-[13px] font-bold">
                  ₦{(h.price_type === 'range' ? h.price_min : h.rate || 0).toLocaleString()}
                </span>
                <Link
                  to={`/create?edit=${h.id}`}
                  className="w-9 h-9 rounded-full border-[1.5px] border-black/10 flex items-center justify-center text-black/50 hover:border-black hover:text-black transition"
                >
                  <Pencil size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(h.id)}
                  className="w-9 h-9 rounded-full border-[1.5px] border-black/10 flex items-center justify-center text-black/50 hover:border-red-500 hover:text-red-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="px-4 pb-4">
                <HatFeedToggle hat={h} onChange={handleHatChange} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
