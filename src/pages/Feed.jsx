// Path: src/pages/Feed.jsx
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import BentoCard from '../components/BentoCard'
import { useBrowseRole } from '../components/Layout'
import { bookHat, submitApplication } from '../lib/hatActions'
import { normalizeUsername } from '../lib/profile.js'

export default function Feed() {
  const navigate = useNavigate()
  const browseRole = useBrowseRole()
  const hatRole = browseRole === 'talent' ? 'client' : 'talent'
  const [hats, setHats] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  // Usernames are stored and searched raw, so a pasted `^simeon` (the Talent
  // display handle) searches for `simeon`.
  const searchTerm = normalizeUsername(search)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await api.getHats({ feed: '1', role: hatRole, search: searchTerm || undefined })
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
  }, [hatRole, searchTerm])

  // The feed is one card per USER, not per hat — a user with several
  // active hats gets a single card (their best/most-recent one) plus a
  // "+N more hats" badge, instead of flooding the feed with duplicates.
  // Derived from `hats` (not separate state) so handleHatChange's in-place
  // patches below stay in sync automatically.
  const groupedHats = useMemo(() => {
    const order = []
    const byUser = new Map()
    for (const h of hats) {
      if (h.feed_visible !== true) continue
      const key = h.user_id || h.id
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
          <h1 className="text-[22px] font-bold tracking-tight">Feed</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">
            {hatRole === 'talent' ? 'Browsing talent hats' : 'Browsing client hats'}
          </p>
        </div>
        <div className="relative sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="search"
            placeholder={hatRole === 'talent' ? 'Search talents…' : 'Search clients…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-full border-[1.5px] border-black bg-white text-[13px] font-medium outline-none focus:ring-4 focus:ring-black/[0.04]"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading…</p>
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
