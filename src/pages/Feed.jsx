// Path: src/pages/Feed.jsx
import { useEffect, useMemo, useState } from 'react'
import CompactPageHeader from '../components/CompactPageHeader.jsx'
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

  // Every Hat is a separate booking target. Group only for proximity:
  // no rotating a user's prices or availability inside a single card.
  const visibleHats = useMemo(() => {
    const groups = new Map()
    for(const h of hats) {
      if(h.feed_visible!==true)continue
      const owner = h.user_id || h.id
      const key = `${owner}:${h.role||'unknown'}`
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push(h)
    }
    return [...groups.values()].flatMap(group=>group.map(hat=>({
      hat,siblingHats:group.filter(other=>other.id!==hat.id),
    })))
  },[hats])

  // Patches a single card in the feed list in place — used so a like/view
  // recorded inside the BentoCardDetailModal (see its `onHatChange`) is
  // reflected the moment the modal closes, without refetching the whole
  // feed or reloading the page.
  function handleHatChange(patch) {
    setHats((prev) => prev.map((h) => (h.id === patch.id ? { ...h, ...patch } : h)))
  }

  return (
    <div className="space-y-5">
      <CompactPageHeader title="Bento Feed" searchValue={search} onSearchChange={setSearch}
        searchLabel="Search BentoField talents and client Hats" searchPlaceholder="Search talents and clients…"/>

      {loading ? (
        <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading…</p>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-[13px] font-medium text-red-700">
          {error}
        </p>
      ) : visibleHats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 text-[13px] font-medium">No hats yet. Create one or check back soon.</p>
        </div>
      ) : (
        // Separate card per Hat: each has its own independent booking action.
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-4">
          {visibleHats.map(({hat,siblingHats}) => (
            <BentoCard
              key={hat.id}
              hat={hat}
              siblingHats={siblingHats}
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
