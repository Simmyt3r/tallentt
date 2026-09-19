// Path: src/components/BentoCard.jsx
import { useState } from 'react'
import { MapPin, Clock } from 'lucide-react'
import BentoCardDetailModal from './BentoCardDetailModal'
import {
  HatOwnerHeader,
  formatAvailabilityWindow,
  formatPrice,
  relativeTime,
  useLikeToggle,
} from './bentoCardShared'
import { cldImage, cldVideoPoster } from '../lib/cloudinary'

// Discovery card: quickly answers "is this hat interesting enough to
// inspect?" — full decision-making detail (About, skills, the Book/Apply
// action, the negotiation notice) lives in BentoCardDetailModal, opened by
// tapping anywhere on the card that isn't itself an interactive element
// (avatar/username/share/like — see HatOwnerHeader, which already stops
// propagation on all of those).
export default function BentoCard({ hat, onBook, onApply, escrow, showMedia = true, onHatChange, fullWidth = false, moreCount = 0 }) {
  const [open, setOpen] = useState(false)

  const isTalent = hat.role === 'talent'
  const pillBg = isTalent ? 'bg-[#0A13E6] text-white' : 'bg-black text-white'
  const media = hat.media?.[0]
  // Talent hats: the talent is "Seeking" bookings for this title. Client
  // hats: the client is "Hiring" for this title.
  const listingLabel = isTalent ? 'Seeking' : 'Hiring'
  const postedAgo = relativeTime(hat.created_at)
  const currency = hat.currency || 'NGN'
  // Talent's specific location — LGA/city + country, not just a bare city name.
  const location = [hat.lga, hat.country].filter(Boolean).join(', ')
  const availabilityWindow = formatAvailabilityWindow(hat)
  // The hats table has one free-text field (`motto`, max 80 chars) used by
  // both talent and client hats — surfaced here as the short description/
  // requirement preview the spec calls for, clamped to two lines so the
  // feed never shows the complete text.
  const description = hat.motto || ''

  const { liked, toggle: toggleLike, liking } = useLikeToggle({
    id: hat.id,
    liked: hat.liked_by_me,
    count: hat.likes,
    onHatChange,
  })

  return (
    <>
      <article
        className={`bg-white rounded-[20px] border-[1.5px] border-black shadow-sm overflow-hidden flex flex-col w-full cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-shadow ${
          fullWidth ? '' : 'max-w-[300px]'
        }`}
        onClick={() => setOpen(true)}
      >
        <div className="p-3.5 pb-2.5">
          <HatOwnerHeader
            cardId={hat.id}
            avatarSrc={hat.owner_avatar || hat.avatar_url}
            displayName={hat.username}
            isVerified={hat.is_verified}
            metaParts={[isTalent ? 'Talent' : 'Client', postedAgo]}
            hatId={hat.id}
            shareTitle={hat.hat_title}
            shareContext={`${listingLabel}: ${hat.hat_title}`}
            liked={liked}
            onToggleLike={toggleLike}
            likeDisabled={liking}
          />

          <div className="mt-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">{listingLabel}</p>
            <p className="text-[15px] font-bold leading-snug truncate">{hat.hat_title}</p>
            {moreCount > 0 && (
              <span className="inline-block mt-0.5 text-[10.5px] font-bold text-[#0A13E6]">
                +{moreCount} more hat{moreCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Media — strict 4:3, consistent across every card regardless of
            the source image/video's own aspect ratio (object-cover). */}
        {showMedia && (
          <div className="relative aspect-[4/3] bg-[#F5F3EF]">
            {media?.url ? (
              media.type === 'video' ? (
                // This tile is never played — tapping the card opens the
                // real player in BentoCardDetailModal below — so it only
                // ever needs a still frame. A muted <video> here would
                // still cost the browser a full video download just to
                // paint one frame; a Cloudinary-generated poster JPG
                // costs none.
                <img
                  src={cldVideoPoster(media.url, { w: 600, h: 450 })}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <img
                  src={cldImage(media.url, { w: 600, h: 450 })}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-black/30 text-[12px] font-medium">
                No media
              </div>
            )}
            <span
              className={`absolute top-2.5 left-2.5 ${pillBg} text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full border-[1.5px] border-black`}
            >
              {hat.hat_type || (isTalent ? 'Talent' : 'Client')}
            </span>
            {hat.availability && (
              <span
                className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[#16C784] border-[1.5px] border-white"
                title="Available"
              />
            )}
            {hat.media && hat.media.length > 1 && (
              <span className="absolute bottom-2.5 right-2.5 bg-black/70 text-white text-[10.5px] font-bold px-2 py-0.5 rounded-full">
                +{hat.media.length - 1}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-3.5 pt-2.5 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[11px] text-black/50 font-medium flex-wrap">
            {location && (
              <span className="flex items-center gap-0.5" title="Talent location">
                <MapPin size={11} /> {location}
              </span>
            )}
            {availabilityWindow && (
              <span className="flex items-center gap-0.5" title="Daily availability window">
                <Clock size={11} /> {availabilityWindow}
              </span>
            )}
          </div>

          <span className="font-bold text-[14px]">{formatPrice(hat, currency)}</span>

          {description && (
            <p className="text-[12px] text-black/60 leading-snug line-clamp-2">{description}</p>
          )}
        </div>
      </article>

      {/* Detail modal — full-screen on Android ≤768px */}
      {open && (
        <BentoCardDetailModal
          hat={hat}
          escrow={escrow}
          showMedia={showMedia}
          onClose={() => setOpen(false)}
          onBook={onBook}
          onApply={onApply}
          onHatChange={onHatChange}
        />
      )}
    </>
  )
}