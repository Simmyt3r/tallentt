import { useEffect, useState } from 'react'
import { ChevronDown, LayoutGrid, List, Pencil, Trash2, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import BentoCard from './BentoCard'
import { Link } from 'react-router-dom'

// Inline panel for a single hat's applicants — fetched lazily (only when
// expanded) via GET /api/hats/:id?include=applications, so MyHats doesn't
// have to fetch every hat's applicants up front. Owner-only accept/reject
// uses the same PATCH action endpoint the rest of the app already uses
// for engagement (see api/hats/[id].js's respond_application action).
function ApplicantsPanel({ hatId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .getHatApplicants(hatId)
      .then((data) => {
        if (!cancelled) setApplications(data.applications || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load applicants')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [hatId])

  async function respond(applicationId, status) {
    // Optimistic — flip the row now, roll back if the server disagrees.
    const prev = applications
    setApplications((list) => list.map((a) => (a.id === applicationId ? { ...a, status } : a)))
    try {
      await api.respondToApplication(hatId, applicationId, status)
    } catch (e) {
      setApplications(prev)
      alert(e.message)
    }
  }

  if (loading) {
    return <p className="text-[12px] text-black/40 font-medium px-3.5 py-3">Loading applicants…</p>
  }
  if (error) {
    return <p className="text-[12px] text-red-600 font-medium px-3.5 py-3">{error}</p>
  }
  if (applications.length === 0) {
    return <p className="text-[12px] text-black/40 font-medium px-3.5 py-3">No applicants yet.</p>
  }

  return (
    <ul className="divide-y divide-black/5">
      {applications.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="w-8 h-8 rounded-full bg-[#F5F3EF] overflow-hidden shrink-0 border border-black/10">
            {a.avatar_url && <img src={a.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold truncate">{a.full_name || a.username}</p>
            {a.message && <p className="text-[12px] text-black/50 truncate">{a.message}</p>}
          </div>
          {a.status === 'pending' ? (
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => respond(a.id, 'accepted')}
                className="h-7 px-3 rounded-full bg-[#0A13E6] text-white text-[11px] font-semibold"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => respond(a.id, 'rejected')}
                className="h-7 px-3 rounded-full border border-black/20 text-black/60 text-[11px] font-semibold"
              >
                Reject
              </button>
            </div>
          ) : (
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 capitalize ${
                a.status === 'accepted'
                  ? 'bg-[#E8FFE6] text-[#0A7A00]'
                  : a.status === 'rejected'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-[#F5F3EF] text-black/50'
              }`}
            >
              {a.status}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function MyHats() {
  const { user } = useAuth()
  const [hats, setHats] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('chombutar_viewMode') || 'grid')
  const [expandedHatId, setExpandedHatId] = useState(null)

  function toggleApplicants(id) {
    setExpandedHatId((prev) => (prev === id ? null : id))
  }

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

  async function handleDelete(id) {
    if (!confirm('Delete this hat?')) return
    try {
      await api.deleteHat(id)
      setHats((prev) => prev.filter((h) => h.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  // Same purpose as Feed.jsx's handleHatChange: patches a single hat in
  // place so a like/view recorded inside the BentoCardDetailModal (opened
  // from the grid view below) is reflected immediately, without needing
  // to refetch "My Hats".
  function handleHatChange(patch) {
    setHats((prev) => prev.map((h) => (h.id === patch.id ? { ...h, ...patch } : h)))
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

              {/* Applications come in on client hats only — talent hats
                  get booked (via escrow), not applied to. */}
              {h.role === 'client' && (
                <div className="bg-white rounded-[16px] border-[1.5px] border-black/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleApplicants(h.id)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-[12px] font-semibold text-black/70"
                  >
                    <span className="flex items-center gap-1.5">
                      <Users size={13} /> Applicants
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${expandedHatId === h.id ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedHatId === h.id && (
                    <div className="border-t border-black/5">
                      <ApplicantsPanel hatId={h.id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {hats.map((h) => (
            <li key={h.id} className="hover:bg-[#F5F3EF]/50 transition">
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                  {h.media?.[0]?.url && <img src={h.media[0].url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] truncate">{h.hat_title}</p>
                  <p className="text-[12px] text-black/50">
                    {h.username} · {h.category} · {h.role}
                  </p>
                </div>
                <span className="text-[13px] font-bold">
                  ₦{(h.price_type === 'range' ? h.price_min : h.rate || 0).toLocaleString()}
                </span>
                {h.role === 'client' && (
                  <button
                    type="button"
                    onClick={() => toggleApplicants(h.id)}
                    title="View applicants"
                    className={`w-9 h-9 rounded-full border-[1.5px] flex items-center justify-center transition ${
                      expandedHatId === h.id
                        ? 'border-black bg-black text-white'
                        : 'border-black/10 text-black/50 hover:border-black hover:text-black'
                    }`}
                  >
                    <Users size={14} />
                  </button>
                )}
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
              {h.role === 'client' && expandedHatId === h.id && (
                <div className="border-t border-black/5">
                  <ApplicantsPanel hatId={h.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}