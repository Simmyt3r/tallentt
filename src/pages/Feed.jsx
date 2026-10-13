// Path: src/pages/Feed.jsx
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import BentoCard from '../components/BentoCard'
import { bookHat, submitApplication } from '../lib/hatActions'
import { normalizeUsername } from '../lib/profile.js'

export default function Feed() {
  const navigate = useNavigate()
  const [hats, setHats] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Usernames are stored and searched raw, so a pasted `^simeon` (the Talent
  // display handle) searches for `simeon`.
  const searchTerm = normalizeUsername(search)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // No role filter: everyone can browse both clients and talents.
        const data = await api.getHats({ feed: '1', search: searchTerm || undefined })
        if (!cancelled) { setHats(data.hats || []); setError('') }
      } catch (e) {
        if (!cancelled) { setHats([]); setError(e.message || 'Could not load Bento Feed.') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchTerm])

  // The feed is one card per user AND Hat role. Dual-role creators appear
  // as both Talent and Client when they have active listings in each role.
  // Multiple hats for the same user in the same role are still condensed.
  // Derived from `hats` (not separate state) so handleHatChange's in-place
  // patches below stay in sync automatically.
  const groupedHats = useMemo(() => {
    const order = []
    const byUser = new Map()
    for (const h of hats) {
      if (h.feed_visible !== true) continue
      const key = `${h.user_id || h.id}:${h.role || 'unknown'}`
      if (!byUser.has(key)) {
        byUser.set(key, [])
        order.push(key)
      }
      byUser.get(key).push(h)
    }
    return order.map((key) => {
      const group = byUser.get(key)
      return { primary: group[0], moreCount: group.length - 1 }
    })
  }, [hats])

  // Patches a single card in the feed list in place — used so a like/view
  // recorded inside the BentoCardDetailModal (see its `onHatChange`) is
  // reflected the moment the modal closes, without refetching the whole
  // feed or reloading the page.
  function handleHatChange(patch) {
    setHats((prev) => prev.map((h) => (h.id === patch.id ? { ...h, ...patch } : h)))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Bento Feed</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">
            Explore talent services and client opportunities together.
          </p>
        </div>
        <div className="relative sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="search"
            placeholder="Search talents and clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-full border-[1.5px] border-black bg-white text-[13px] font-medium outline-none focus:ring-4 focus:ring-black/[0.04]"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading…</p>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-[13px] font-medium text-red-700">
          {error}
        </p>
      ) : groupedHats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 text-[13px] font-medium">No hats yet. Create one or check back soon.</p>
        </div>
      ) : (
        // Responsive by content, not by breakpoint headcount: each card
        // gets at least 300px and the grid fits as many as the available
        // width allows (1 on a phone, up to several on a wide desktop),
        // rather than a fixed column count per screen size.
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          {groupedHats.map(({ primary, moreCount }) => (
            <BentoCard
              key={primary.id}
              hat={primary}
              moreCount={moreCount}
              showFeedAction
              onBook={(hat, proposal) => bookHat(hat, navigate, proposal)}
              onApply={(hat, proposal) => submitApplication(hat, handleHatChange, navigate, proposal)}
              fullWidth
              onHatChange={handleHatChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
