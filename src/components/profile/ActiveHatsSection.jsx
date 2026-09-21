// Path: src/components/profile/ActiveHatsSection.jsx
import { Link } from 'react-router-dom'
import { hatSeeking } from '../../lib/hatSeeking.js'
import { isBusinessIdentity } from '../../lib/profile.js'

function HatChip({ hat }) {
  return (
    <Link
      to={`/talent/${hat.id}`}
      className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 hover:border-black transition"
    >
      {hatSeeking(hat)}
      {hat.category && <span className="text-black/40 font-medium"> · {hat.category}</span>}
    </Link>
  )
}

// Section 19: Profile may DISPLAY or LINK to Hats, never redesign them —
// each chip below links straight into the existing per-hat page
// (/talent/:hatId), the same "existing Hat experience" Booking already
// lives in. No booking/negotiation logic duplicated here.
export default function ActiveHatsSection({ role, talentHats = [], clientHats = [] }) {
  const isBusiness = isBusinessIdentity(role)
  const showAvailableFor = talentHats.length > 0
  const showHiring = isBusiness || clientHats.length > 0

  if (!showAvailableFor && !showHiring) return null

  return (
    <div className="space-y-5">
      {showAvailableFor && (
        <section aria-labelledby="available-for-heading" className="space-y-2.5">
          <h2 id="available-for-heading" className="text-[15px] font-bold tracking-tight">
            Available For
          </h2>
          <div className="flex flex-wrap gap-2">
            {talentHats.map((hat) => (
              <HatChip key={hat.id} hat={hat} />
            ))}
          </div>
        </section>
      )}

      {showHiring && (
        <section aria-labelledby="hiring-heading" className="space-y-2.5">
          <h2 id="hiring-heading" className="text-[15px] font-bold tracking-tight">
            Hiring
          </h2>
          {clientHats.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {clientHats.map((hat) => (
                <HatChip key={hat.id} hat={hat} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-black/40 font-medium">No active opportunities right now.</p>
          )}
        </section>
      )}
    </div>
  )
}