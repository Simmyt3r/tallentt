// Path: src/components/BentoCard.jsx
import { useState } from 'react'
import { BookOpen, Send } from 'lucide-react'
import BentoCardDetailModal from './BentoCardDetailModal'
import UserIdentity from './UserIdentity'
import RoleCardBadge from './RoleCardBadge'
import { identityFromHat } from '../lib/profile.js'
import { getHatAccent, getShowroomTemplate } from '../lib/hatPresentation.js'
import {
  formatAvailabilityWindow,
  formatPrice,
  useLikeToggle,
} from './bentoCardShared'

// Bento offers the original standard card or a verified, owner-selected
// flier image. Both layouts keep identity, role and booking controls visible.
export default function BentoCard({ hat, onBook, onApply, escrow, onHatChange, fullWidth = false, moreCount = 0, showFeedAction = false }) {
  const [open, setOpen] = useState(false)

  const isTalent = hat.role === 'talent'
  const layout = getShowroomTemplate(hat.showroom_template)
  const theme = {
    minimal: 'bg-white',
    bold: 'bg-[#FFF0DB] ring-2 ring-[#DC4F36]/20',
    'media-first': 'bg-[#EAF8F8] border-[#007F95]/20',
    editorial: 'bg-[#F5F0FF] border-[#744AC9]/20',
    dark: 'bg-[#182033] text-white border-[#283A51]',
  }[layout]
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
  const featuredMedia = (hat.media || []).find(m => m.url && ['legacy','passed'].includes(m.screening_status || 'legacy') && ['image','video'].includes(m.type))
  const flyer = hat.bento_mode === 'flyer' ? (hat.media || []).find((m) =>
    m.type === 'image' && m.public_id === hat.flyer_public_id &&
    ['legacy', 'passed'].includes(m.screening_status || 'legacy')) : null

  const { liked, count: likeCount, toggle: toggleLike, liking } = useLikeToggle({
    id: hat.id,
    liked: hat.liked_by_me,
    count: hat.likes,
    onHatChange,
  })

  return (
    <>
      <article
        style={{ borderTopColor: getHatAccent(hat.bento_accent), borderTopWidth: hat.bento_accent === 'none' ? 0 : 4 }}
        className={`bento-layout bento-layout--${layout} relative rounded-[24px] p-4 border shadow-[0_8px_24px_rgba(0,0,0,0.04)] min-h-[264px] flex flex-col w-full ${theme} ${
          fullWidth ? '' : 'max-w-[300px]'
        }`}
      >
        <RoleCardBadge role={hat.role} className="absolute top-3 right-3 z-10" />
        {layout !== 'minimal' && <span className={`mb-2 w-fit rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${layout === 'dark' ? 'bg-white/15 text-white' : 'bg-black/5 text-black/60'}`}>{layout.replace('-', ' ')}</span>}
        <UserIdentity
          user={owner}
          className="pr-11"
          align="start"
          gap="gap-3"
          nameClassName="font-bold text-[14.5px] leading-tight"
          usernameClassName={layout === 'dark' ? '!text-[#AABFFF] font-extrabold text-[13px] leading-tight' : 'text-[#0A13E6] font-extrabold text-[13px] leading-tight'}
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

        {!flyer && layout === 'media-first' && featuredMedia && (
          <div className="order-first mb-3 overflow-hidden rounded-xl border border-black/10 bg-black/5">
            {featuredMedia.type === 'video' ? <video src={featuredMedia.url} controls preload="metadata" className="aspect-[16/9] w-full object-cover" /> :
              <img src={featuredMedia.url} alt={featuredMedia.caption || 'Featured Hat media'} loading="lazy" className="aspect-[16/9] w-full object-cover" />}
          </div>
        )}
        {flyer ? (
          <figure className="mt-3 min-w-0 rounded-[16px] overflow-hidden bg-[#F7F3EB] border border-black/10">
            <img src={flyer.url} alt={flyer.caption || `${hat.hat_name || hat.hat_title} flier`}
              loading="lazy" className="w-full h-[228px] object-contain" />
            <figcaption className="px-3 py-2 text-[11px] font-bold text-black/75 line-clamp-2">
              {hat.hat_name || hat.hat_title} · {formatPrice(hat, currency)}
            </figcaption>
          </figure>
        ) : (
          <>
        {motto && (
          <div className="mt-3 border-l-4 pl-3 py-1 bg-[#FFEBE0]/20 rounded-r-xl" style={{ borderLeftColor: getHatAccent(hat.bento_accent), borderLeftWidth: hat.bento_accent === 'none' ? 0 : 4 }}>
            <p className={`text-[12px] italic leading-snug ${layout === 'dark' ? 'text-white/85' : 'text-black/60'}`}>&quot;{motto}&quot;</p>
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
          <span className="font-bold shrink-0" style={{ color: hat.bento_accent === 'none' ? 'inherit' : getHatAccent(hat.bento_accent) }}>{formatPrice(hat, currency)}</span>
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

          </>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
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
          {showFeedAction && (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(true)
              }}
              className={`min-h-[44px] px-4 rounded-full inline-flex items-center justify-center gap-2 text-[12px] font-semibold text-white border border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6] transition-colors ${isTalent ? 'bg-[#0A13E6] hover:bg-black' : 'bg-black hover:bg-[#0A13E6]'}`}
            >
              {isTalent ? <BookOpen size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
              {isTalent ? 'View/Book' : 'View/Apply'}
            </button>
          )}
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
