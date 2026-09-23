// Path: src/components/BentoCard.jsx
import { useState } from 'react'
import BentoCardDetailModal from './BentoCardDetailModal'
import UserIdentity from './UserIdentity'
import { identityFromHat } from '../lib/profile.js'
import {
  formatAvailabilityWindow,
  formatPrice,
  useLikeToggle,
} from './bentoCardShared'

// Discovery card — matches the owner's TWorld reference mockup: a compact,
// text-only card (no media; portfolio browsing lives in Showroom instead)
// that answers "is this hat interesting enough to open?". Tapping anywhere
// on the card that isn't the avatar/username/like opens
// BentoCardDetailModal, which owns the actual Book/Apply decision — this
// card deliberately has no primary-action button of its own.
export default function BentoCard({ hat, onBook, onApply, escrow, onHatChange, fullWidth = false, moreCount = 0 }) {
  const [open, setOpen] = useState(false)

  const isTalent = hat.role === 'talent'
  const owner = identityFromHat(hat)
  // "N jobs" on a talent hat (completed gigs), "N hires" on a client hat
  // (people they've successfully hired) — same underlying released-escrow
  // count from the API, the label is the only thing that differs by role.
  const engagementLabel = isTalent ? 'jobs' : 'hires'
  // The mockup's location pill shows the bare LGA/city only (no country) —
  // matches how it's used as a compact pill next to the jobs/hires badge.
  const location = hat.lga || ''
  const motto = hat.motto || ''
  const availabilityWindow = formatAvailabilityWindow(hat)
  const currency = hat.currency || 'NGN'

  const { liked, count: likeCount, toggle: toggleLike, liking } = useLikeToggle({
    id: hat.id,
    liked: hat.liked_by_me,
    count: hat.likes,
    onHatChange,
  })

  return (
    <>
      <article
        className={`bg-white rounded-[24px] p-4 border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)] transition-all min-h-[264px] flex flex-col w-full ${
          fullWidth ? '' : 'max-w-[300px]'
        }`}
        onClick={() => setOpen(true)}
      >
        <UserIdentity
          user={owner}
          align="start"
          gap="gap-3"
          nameClassName="font-bold text-[14.5px] leading-tight"
          usernameClassName="text-[#0A13E6] font-extrabold text-[13px] leading-tight"
          avatarBadge={
            hat.availability ? (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
            ) : null
          }
        >
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {location && (
              <span className="bg-[#FFEBE0] text-[10px] font-bold px-2 py-1 rounded-full">{location}</span>
            )}
            <span className="bg-black text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              {hat.hires || 0} {engagementLabel}
            </span>
          </div>
        </UserIdentity>

        {motto && (
          <div className="mt-3 border-l-4 pl-3 py-1 bg-[#FFEBE0]/20 rounded-r-xl" style={{ borderLeftColor: '#0A13E6' }}>
            <p className="text-[12px] italic text-black/60 leading-snug">&quot;{motto}&quot;</p>
          </div>
        )}

        <div className="mt-3 text-[12px] leading-snug">
          <span className="font-bold text-black/70">Hats:</span>{' '}
          <span className="font-semibold text-black">{hat.hat_name || hat.hat_title}</span>
          {moreCount > 0 && <span className="font-bold text-black/50"> +{moreCount} more</span>}
        </div>

        <div className="mt-1.5 text-[12px] leading-snug flex items-baseline gap-1">
          <span className="font-bold text-black/70 shrink-0">{isTalent ? 'Available:' : 'Hiring:'}</span>
          <span className="font-semibold text-black truncate">{hat.hat_title}</span>
          <span className="text-black/40 font-bold mx-0.5">:</span>
          <span className="font-bold text-[#0A13E6] shrink-0">{formatPrice(hat, currency)}</span>
        </div>

        {isTalent ? (
          availabilityWindow && (
            <div className="mt-1.5 text-[12px] leading-snug flex items-baseline gap-1">
              <span className="font-bold text-black/70 shrink-0">Time:</span>
              <span className="font-medium text-black/80 truncate">{availabilityWindow}</span>
            </div>
          )
        ) : (
          <>
            {hat.hiring_duration && (
              <div className="mt-1.5 text-[12px] leading-snug flex items-baseline gap-1">
                <span className="font-bold text-black/70 shrink-0">Duration:</span>
                <span className="font-medium text-black/80 truncate">{hat.hiring_duration}</span>
              </div>
            )}
            {(location || availabilityWindow) && (
            <div className="mt-1.5 text-[12px] leading-snug flex items-baseline gap-1">
              <span className="font-bold text-black/70 shrink-0">Event:</span>
              <span className="font-medium text-black/80 truncate">
                {[location, availabilityWindow].filter(Boolean).join(' • ')}
              </span>
            </div>
          )}
          </>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleLike()
            }}
            disabled={liking}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            className={`flex items-center gap-1 text-[11px] hover:text-[#0A13E6] disabled:opacity-50 ${liked ? 'text-[#0A13E6]' : ''}`}
          >
            <span className="text-[13px]">{liked ? '❤' : '♡'}</span> {likeCount || 0}
          </button>
        </div>
      </article>

      {open && (
        <BentoCardDetailModal
          hat={hat}
          escrow={escrow}
          onClose={() => setOpen(false)}
          onBook={onBook}
          onApply={onApply}
          onHatChange={onHatChange}
        />
      )}
    </>
  )
}