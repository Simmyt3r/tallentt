// Path: src/components/BentoCard.jsx
// CONFORMED TO TWORLD-PART-1-_-Downloadable-Reference-1_1.html
// Reference component: Mm({talent:e,viewMode:n,onClick:t,onLike:r,onBook:l})
import { useState, useEffect } from 'react'
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

// HTML Reference logic:
// - Dual role: o = e.role==="dual" ? n==="creator" ? "client" : "talent" : e.role==="client" ? "client" : "talent"
// - Motto truncated 60 chars: i = e.motto.length>60 ? e.motto.slice(0,60)+"…" : e.motto
// - Hats extraction: c(U,ne) => U?.hats array || U?.hat => [{hat:U.hat, rate:U.hat, price:ne, priceMin:ne, priceMax:ne*1.6, active:!0}]
// - Price format L(U): ₦M / ₦k / ₦ toLocaleString
// - Price range F(U): priceMin-priceMax
// - Visual: bg-white rounded-[24px] p-4 border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.04)]

export default function BentoCard({ 
  hat, 
  viewMode = 'creator', // creator = browsing Clients, employer = browsing Talents (from HTML talentworld_role)
  onBook, 
  onApply, 
  escrow, 
  showMedia = true, 
  onHatChange, 
  fullWidth = false, 
  moreCount = 0 
}) {
  const [open, setOpen] = useState(false)
  const [activeHatIndex, setActiveHatIndex] = useState(0)
  const [activeEventIndex, setActiveEventIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // --- CONFORMED ROLE LOGIC FROM HTML (Mm component) ---
  const effectiveRole = hat.role === 'dual' 
    ? viewMode === 'creator' ? 'client' : 'talent' 
    : hat.role === 'client' ? 'client' : 'talent'
  const isTalent = effectiveRole === 'talent'

  // --- MOTTO TRUNCATION 60 CHARS (HTML: i = e.motto.length>60 ? slice(0,60)+… ) ---
  const shortMotto = hat.motto && hat.motto.length > 60 
    ? `${hat.motto.slice(0, 60)}…` 
    : hat.motto || ''
  const fullDescription = hat.motto || ''

  // --- HATS EXTRACTION (HTML: c function) ---
  const extractHats = (data, fallbackPrice) => {
    if (data?.hats && Array.isArray(data.hats) && data.hats.length > 0) return data.hats
    if (data?.hat) return [{ 
      hat: data.hat, 
      rate: data.hat, 
      price: fallbackPrice, 
      priceMin: fallbackPrice, 
      priceMax: Math.round(fallbackPrice * 1.6), 
      active: true 
    }]
    return []
  }

  // Support both new flat hat structure and old talentData/clientData structure from HTML
  const talentHats = hat.talentData ? extractHats(hat.talentData, hat.price) : [{ hat: hat.hat_title, rate: hat.rate, priceMin: hat.price_min || hat.price, priceMax: hat.price_max, active: true }]
  const clientHats = hat.clientData ? extractHats(hat.clientData, hat.price) : [{ hat: hat.hat_title, rate: hat.rate, priceMin: hat.price_min || hat.price, priceMax: hat.price_max, active: true }]
  
  const hatsToShow = isTalent ? talentHats : clientHats
  const activeHats = hatsToShow.filter(h => h.active)
  const displayHats = activeHats.length > 0 ? activeHats : hatsToShow
  const currentHat = displayHats[activeHatIndex] || displayHats[0] || null
  const remainingCount = Math.max(0, displayHats.length - 1)

  // --- PRICE FORMATTING L() and F() FROM HTML ---
  const formatNaira = (val) => {
    if (!val) return '₦—'
    if (val >= 1_000_000) return `₦${(val/1_000_000).toFixed(val%1_000_000===0?0:1)}M`
    if (val >= 1000) return `₦${Math.round(val/1000)}k`
    return `₦${val.toLocaleString()}`
  }
  const formatPriceRange = (h) => {
    const min = h?.priceMin ?? h?.price ?? 0
    const max = h?.priceMax ?? (h?.price ? Math.round(h.price*1.6) : 0)
    if (!min && !max) return '₦—'
    if (min && max && min !== max) return `${formatNaira(min)}-${formatNaira(max).replace('₦','')}`
    if (min) return `${formatNaira(min)}`
    return `${formatNaira(max)}`
  }

  // --- AUTO-ROTATE HATS (HTML: setInterval 3500ms with fade) ---
  useEffect(() => {
    setActiveHatIndex(0)
    setActiveEventIndex(0)
  }, [effectiveRole, hat.id])

  useEffect(() => {
    if (displayHats.length <= 1 && (hat.clientData?.events?.length || 0) <= 1) return
    const interval = setInterval(() => {
      setIsVisible(false)
      setTimeout(() => {
        setActiveHatIndex(prev => displayHats.length ? (prev+1) % displayHats.length : prev)
        setActiveEventIndex(prev => {
          const len = hat.clientData?.events?.length || 1
          return len ? (prev+1) % len : prev
        })
        setIsVisible(true)
      }, 180)
    }, 3500)
    return () => clearInterval(interval)
  }, [displayHats.length, hat.id, effectiveRole, hat.clientData?.events?.length])

  const listingLabel = isTalent ? 'Seeking' : 'Hiring'
  const postedAgo = relativeTime(hat.created_at)
  const currency = hat.currency || 'NGN'
  const location = [hat.lga, hat.country].filter(Boolean).join(', ')
  
  // Availability from HTML: In = e.talentData.availability || "Mon-Sat, 8AM-8PM"
  const availabilityWindow = formatAvailabilityWindow(hat) || hat.talentData?.availability || "Mon-Sat, 8AM-8PM"
  
  const media = hat.media?.[0]
  const pillBg = isTalent ? 'bg-[#0A13E6] text-white' : 'bg-black text-white'
  const priceDisplay = currentHat ? formatPriceRange(currentHat) : formatPrice(hat, currency)

  const { liked, toggle: toggleLike, liking } = useLikeToggle({
    id: hat.id,
    liked: hat.liked_by_me,
    count: hat.likes,
    onHatChange,
  })

  // For Hiring/Available label logic from HTML snippet:
  // Hiring: bn (rate/hat) : Available: ou (price range)
  const hiringOrAvailableLabel = isTalent ? 'Available:' : 'Hiring:'
  const hiringValue = currentHat?.rate || currentHat?.hat || ''
  const priceValue = currentHat ? formatPriceRange(currentHat) : ''

  return (
    <>
      <article
        className={`bg-white rounded-[24px] p-4 border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition-all duration-200 flex flex-col w-full overflow-hidden ${
          fullWidth ? '' : 'max-w-[300px]'
        }`}
        onClick={() => setOpen(true)}
      >
        <div className="pb-2.5">
          <HatOwnerHeader
            cardId={hat.id}
            avatarSrc={hat.owner_avatar || hat.avatar_url || hat.avatar}
            displayName={hat.username || hat.name}
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
            {remainingCount > 0 && (
              <span className="inline-block mt-0.5 ml-1 text-[10.5px] font-bold text-black/40">
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>

        {/* Media — strict 4:3 as per your original code comment */}
        {showMedia && (
          <div className="relative aspect-[4/3] bg-[#F5F3EF] rounded-[16px] overflow-hidden">
            {media?.url ? (
              media.type === 'video' ? (
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

        {/* Body — conformed to HTML Hiring:/Available: + Time: pattern */}
        <div className="pt-3 flex-1 flex flex-col gap-1.5">
          <div className={`text-[12px] leading-snug flex items-baseline gap-1 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <span className="font-bold text-black/70 shrink-0">{hiringOrAvailableLabel}</span>
            <span className="font-semibold text-black truncate">{hiringValue}</span>
            <span className="text-black/40 font-bold mx-0.5">:</span>
            <span className="font-bold text-[#0A13E6] shrink-0">{priceValue}</span>
          </div>

          {isTalent && (
            <div className="text-[12px] leading-snug flex items-baseline gap-1">
              <span className="font-bold text-black/70 shrink-0">Time:</span>
              <span className="font-medium text-black/80 truncate">{availabilityWindow}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-black/50 font-medium flex-wrap mt-0.5">
            {location && (
              <span className="flex items-center gap-0.5" title="Talent location">
                <MapPin size={11} /> {location}
              </span>
            )}
            {!isTalent && availabilityWindow && (
              <span className="flex items-center gap-0.5" title="Daily availability window">
                <Clock size={11} /> {availabilityWindow}
              </span>
            )}
          </div>

          <span className="font-bold text-[14px] mt-0.5">{priceDisplay}</span>

          {shortMotto && (
            <p className="text-[12px] text-black/60 leading-snug line-clamp-2">{shortMotto}</p>
          )}

          {/* Action row — HTML: Book Now / Apply Now + like + comments */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-black/50">
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-black/20 rounded-full"></span>
                <span className="font-bold">{hat.likes || 0} likes</span>
              </span>
              <span className="flex items-center gap-1">
                <span>💬</span> {hat.commentsCount || hat.comments_count || 0}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                isTalent ? onBook?.(hat) : onApply?.(hat)
              }}
              className="h-8 px-4 bg-[#0A13E6] text-white rounded-full text-[11px] font-bold hover:opacity-90 transition-opacity"
            >
              {isTalent ? 'Book Now' : 'Apply Now'}
            </button>
          </div>
        </div>
      </article>

      {open && (
        <BentoCardDetailModal
          hat={{...hat, currentHat, effectiveRole}}
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
