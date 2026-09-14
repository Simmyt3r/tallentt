import { useState } from 'react'
import { Heart, MapPin, Star, Clock } from 'lucide-react'
import BentoCardDetailModal from './BentoCardDetailModal'
import { Avatar, formatAvailabilityWindow, formatPrice } from './bentoCardShared'

export default function BentoCard({ hat, onBook, onApply, escrow, showMedia = true, onHatChange }) {
  const [open, setOpen] = useState(false)

  const isTalent = hat.role === 'talent'
  const pillBg = isTalent ? 'bg-[#0A13E6] text-white' : 'bg-black text-white'
  const media = hat.media?.[0]
  // Clients don't need a motto shown — talent voice only.
  const motto = isTalent && hat.motto
    ? hat.motto.length > 60
      ? hat.motto.slice(0, 60) + '…'
      : hat.motto
    : ''
  const currency = hat.currency || 'NGN'
  // Talent's specific location — LGA/city + country, not just a bare city name.
  const location = [hat.lga, hat.country].filter(Boolean).join(', ')
  const availabilityWindow = formatAvailabilityWindow(hat)

  return (
    <>
      <article
        className="bg-white rounded-[20px] border-[1.5px] border-black shadow-sm overflow-hidden flex flex-col w-full cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-shadow"
        onClick={() => setOpen(true)}
      >
        {/* Media */}
        {showMedia && (
          <div className="relative aspect-[4/3] bg-[#F5F3EF]">
            {media?.url ? (
              media.type === 'video' ? (
                <video src={media.url} className="w-full h-full object-cover" muted playsInline />
              ) : (
                <img src={media.url} alt="" className="w-full h-full object-cover" loading="lazy" />
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
          </div>
        )}

        {/* Body — one consistent gap-2.5 (10px) rhythm between every row
            instead of the previous mixed p-3.5/gap-2/pt-1/mt-1.5 values,
            so the vertical spacing reads as one deliberate unit rather
            than several slightly different ones. */}
        <div className="p-4 flex-1 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar src={hat.owner_avatar || hat.avatar_url} name={hat.username} className="w-11 h-11" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate leading-tight flex items-center gap-1">
                {hat.username}
                {hat.is_verified && (
                  <span className="text-[#0A13E6] text-[12px]" title="Verified">
                    ✓
                  </span>
                )}
              </p>
              <p className="text-[12px] text-black/50 truncate">{hat.hat_title}</p>
              {motto && <p className="text-[12px] text-black/70 leading-snug line-clamp-2 italic mt-0.5">"{motto}"</p>}
            </div>
            {!showMedia && (
              <div className="flex items-center gap-1.5 shrink-0">
                {hat.availability && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#16C784] border-[1.5px] border-white shadow-sm" title="Available" />
                )}
                <span
                  className={`${pillBg} text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded-full border-[1.5px] border-black`}
                >
                  {hat.hat_type || (isTalent ? 'Talent' : 'Client')}
                </span>
              </div>
            )}
          </div>

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
            {hat.category && (
              <span className="truncate px-2.5 py-1 rounded-full bg-[#F5F3EF] border border-black/10">
                {hat.category}
              </span>
            )}
            {hat.delivery_mode && (
              <span className="truncate px-2.5 py-1 rounded-full bg-[#F5F3EF] border border-black/10">
                {hat.delivery_mode}
              </span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between">
            <span className="font-bold text-[14px]">{formatPrice(hat, currency)}</span>
            <div className="flex items-center gap-2.5 text-[11px] text-black/50">
              <span className="flex items-center gap-0.5">
                <Star size={12} className="text-amber-400 fill-amber-400" /> {Number(hat.rating || 0).toFixed(1)}
              </span>
              {(hat.orbit_score != null || hat.confidence != null) && (
                <span className="text-[10px] font-bold tracking-wide text-[#0A13E6]" title="Orbit confidence score">
                  {hat.orbit_score ?? hat.confidence}% conf
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <Heart size={12} /> {hat.likes || 0}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`w-full h-10 rounded-full text-[13px] font-semibold border-[1.5px] border-black text-white transition hover:brightness-110 active:scale-[0.98] ${
              isTalent ? 'bg-[#0A13E6]' : 'bg-black'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              if (isTalent) onBook?.(hat)
              else onApply?.(hat)
            }}
          >
            {isTalent ? 'Book Talent' : 'Apply'}
          </button>
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