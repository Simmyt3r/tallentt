import { Star } from 'lucide-react'
import { singleDigitOrbit } from '../../lib/profileScore.js'

export default function ProfileScore({ orbit, reputation, profileUser, rankings }) {
  const digit = singleDigitOrbit(orbit?.score)
  const ratings = Array.isArray(reputation?.ratings) ? reputation.ratings : []
  const talent = ratings.find(item => item.lane === 'talent' && Number(item.count)>0)
  const employer = ratings.find(item => item.lane === 'employer' && Number(item.count)>0)
  const preferred = talent || employer
  const rating = preferred && Number.isFinite(Number(preferred.rating)) ? Number(preferred.rating).toFixed(1) : null
  const location = profileUser?.lga || null
  const levels = [
    { key: 'global', label: 'Global' },
    { key: 'national', label: profileUser?.country ? `National · ${profileUser.country}` : 'National' },
    { key: 'state', label: 'State / province' },
    { key: 'city', label: location ? `City / LGA · ${location}` : 'City / LGA' },
  ]
  return <section aria-label="Orbit score and ranking" className="space-y-3 rounded-2xl border border-black/10 bg-white p-4 sm:p-5">
    <h2 className="text-[15px] font-black">Score & ranking</h2>
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#F1F3FF] px-3 py-3 text-[13px]">
      <span className="font-black text-[#0A13E6]">Orbit {digit ?? '—'}</span>
      <span className="text-black/30" aria-hidden="true">×</span>
      {rating ? <span className="inline-flex items-center gap-1 font-bold"><Star size={14} className="fill-amber-400 text-amber-400"/> {rating}/5 <span className="font-normal text-black/55">({preferred.count} review{preferred.count===1?'':'s'})</span></span>
        : <span className="text-black/60">Not rated yet</span>}
    </div>
    {digit !== null && rating && <p className="text-[11px] text-black/55">Orbit × rating: {(digit * Number(rating)).toFixed(1)}. Activity and completed-work ratings measure different things.</p>}
    <div className="overflow-hidden rounded-xl border border-black/10">
      <table className="w-full table-fixed text-left text-[12px]">
        <thead className="bg-[#F7F3EB]"><tr><th scope="col" className="w-1/2 px-3 py-2 font-black">Level</th><th scope="col" className="w-1/2 px-3 py-2 font-black">Tier</th></tr></thead>
        <tbody>{levels.map(level => <tr key={level.key} className="border-t border-black/10"><th scope="row" className="break-words px-3 py-3 font-semibold">{level.label}</th><td className="px-3 py-3 text-black/55">{rankings?.[level.key]?.tier || 'Not ranked'}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="text-[11px] text-black/50">Top 5 / Top 10 tiers appear only when verified location-based rankings are available. No position is estimated from incomplete data.</p>
  </section>
}
