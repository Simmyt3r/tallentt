// Path: src/components/profile/ProfileCompletenessCard.jsx
import { computeProfileCompleteness } from '../../lib/profile.js'

// Owner-only (the page that renders this never mounts it for visitors —
// see ProfileView.jsx). Percentage is computed from real, applicable
// fields (src/lib/profile.js) — never an arbitrary number.
export default function ProfileCompletenessCard({ role, user, skillsCount, industryCount, portfolioCount }) {
  const { percent, missing } = computeProfileCompleteness({ role, user, skillsCount, industryCount, portfolioCount })

  return (
    <div className="rounded-[18px] border-[1.5px] border-black/10 bg-[#F5F3EF] p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="tw-label">Profile strength</p>
        <p className="text-[13px] font-bold">{percent}%</p>
      </div>
      <div className="h-2 rounded-full bg-black/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#0A13E6] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {missing.length > 0 ? (
        <p className="text-[12px] text-black/60 font-medium leading-snug">
          {missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1].toLowerCase()}`}.
        </p>
      ) : (
        <p className="text-[12px] text-green-700 font-semibold">Your profile is fully set up.</p>
      )}
    </div>
  )
}