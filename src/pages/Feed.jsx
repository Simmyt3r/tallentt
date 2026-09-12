import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import BentoCard from '../components/BentoCard'
import { useBrowseRole } from '../components/Layout'

export default function Feed() {
  const browseRole = useBrowseRole()
  const hatRole = browseRole === 'talent' ? 'client' : 'talent'
  const [hats, setHats] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await api.getHats({ role: hatRole, search: search || undefined })
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
  }, [hatRole, search])

  async function handleBook(hat) {
    try {
      const { escrow } = await api.createEscrow({ hat_id: hat.id, talent_id: hat.user_id })
      if (confirm(`Escrow created for ₦${escrow.amount.toLocaleString()}. Fund now to unlock contacts?`)) {
        await api.fundEscrow(escrow.id)
        alert('Escrow secured! Contacts unlocked.')
      }
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleApply(hat) {
    try {
      const { application, already_applied } = await api.applyToHat(hat.id)
      handleHatChange({ id: hat.id, my_application: application })
      alert(
        already_applied
          ? `You already applied for “${hat.hat_title}”.`
          : `Application sent for “${hat.hat_title}”.`,
      )
    } catch (e) {
      alert(e.message)
    }
  }

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
      ) : hats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 text-[13px] font-medium">No hats yet. Create one or check back soon.</p>
        </div>
      ) : (
        <div className="hats-grid">
          {hats.map((h) => (
            <BentoCard
              key={h.id}
              hat={h}
              onBook={handleBook}
              onApply={handleApply}
              showMedia={false}
              onHatChange={handleHatChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}