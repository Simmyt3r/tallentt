import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock, Eye, Heart, MapPin, Play, Share2, X } from 'lucide-react'
import { api } from '../lib/api'
import { cldImage, cldVideoPoster } from '../lib/cloudinary'
import { useBackdropClose, useDialog, useScrollLock } from '../lib/dialog'
import { useAuth } from '../context/AuthContext'
import { getPrimaryIdentity, identityFromHat } from '../lib/profile.js'
import AvailabilityBadge from './AvailabilityBadge'
import ShowroomMedia from './ShowroomMedia'
import UserIdentity from './UserIdentity'
import { NegotiationProposalModal, formatAvailabilityWindow, formatPrice, relativeTime } from './bentoCardShared'
import { bookHat } from '../lib/hatActions'

const iconBtn =
  'inline-flex items-center justify-center gap-1.5 h-11 min-w-[44px] px-3 rounded-full text-[13px] font-semibold transition hover:bg-black/[0.06] active:scale-95'

function timeAgo(value) {
  const t = relativeTime(value)
  return /^\d+[mhd]$/.test(t) ? `${t} ago` : t
}

function RelatedItem({ hat, onSelect }) {
  const [broken, setBroken] = useState(false)
  const owner = identityFromHat(hat)
  const media = hat.media?.[0]
  const isVideo = media?.type === 'video' && !!media?.url
  const thumb = media?.url
    ? isVideo
      ? cldVideoPoster(media.url, { w: 320, h: 180 })
      : cldImage(media.url, { w: 320, h: 180 })
    : null
  const title = media?.caption || hat.motto || hat.hat_title || ''
  // The whole row opens the post, but the owner's name and username are links
  // to their profile — a link can't live inside a button, so the button is a
  // transparent layer under the row and only the profile links sit above it.
  return (
    <li className="relative flex gap-3 p-2 rounded-xl text-left transition hover:bg-black/[0.04] focus-within:bg-black/[0.04]">
      <button
        type="button"
        onClick={() => onSelect(hat.id)}
        aria-label={`Open ${getPrimaryIdentity(owner)}'s post${title ? `: ${title}` : ''}`}
        className="absolute inset-0 rounded-xl"
      />
      <div className="pointer-events-none relative shrink-0 w-[132px] xl:w-[128px] aspect-video rounded-lg overflow-hidden bg-[#0b0b0b] border border-black/10">
          {thumb && !broken ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              onError={() => setBroken(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-white/30 text-[10px] font-medium">
              {media?.url ? 'Unavailable' : 'No media'}
            </span>
          )}
          {isVideo && (
            <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5" aria-hidden="true">
              <Play size={9} className="text-white" fill="white" />
            </span>
          )}
        </div>
      <div className="pointer-events-none relative min-w-0 flex-1 py-0.5">
        {title && <p className="text-[13px] font-semibold leading-snug line-clamp-2 break-words">{title}</p>}
        <UserIdentity
          user={owner}
          showAvatar={false}
          className="mt-0.5"
          nameClassName="text-[12px] font-semibold text-black/70 leading-tight"
          usernameClassName="text-[11px] font-semibold text-black/50 leading-tight"
        />
        <p className="text-[11px] text-black/40 mt-0.5 flex items-center gap-1">
          <Eye size={11} aria-hidden="true" /> {hat.views || 0}
        </p>
      </div>
    </li>
  )
}

// Overlay over the live Showroom. Everything about *which* post is showing
// comes from the URL (/showroom/:postId), owned by Showroom — this component
// just renders what it is handed, so browser Back, refresh, direct links and
// related-post switching all behave the same way.
export default function ShowroomDetailModal({
  hat,
  status, // 'loading' | 'ready' | 'unavailable' | 'error'
  related,
  muted,
  onMutedChange,
  onClose,
  onSelect,
  onLike,
  onShare,
  onRetry,
  onNotify,
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const bookRef = useRef(null)
  const bodyRef = useRef(null)
  const mainRef = useRef(null)
  const [aspect, setAspect] = useState(null)
  const [negotiationStep, setNegotiationStep] = useState(null)
  const [checking, setChecking] = useState(false)
  const [bookCandidate, setBookCandidate] = useState(null)
  const checkingRef = useRef(false) // synchronous guard: state alone can't stop clicks in the same tick

  useScrollLock()
  useDialog(panelRef, { onClose, initialFocusRef: closeRef })
  const backdrop = useBackdropClose(onClose)

  // A newly selected post starts from the top of the modal, at its own shape.
  const hatId = hat?.id
  useEffect(() => {
    setAspect(null)
    setNegotiationStep(null)
    setBookCandidate(null)
    bodyRef.current?.scrollTo?.(0, 0)
    mainRef.current?.scrollTo?.(0, 0)
  }, [hatId])

  const media = hat?.media?.[0]
  const caption = media?.caption || hat?.motto || ''
  const location = hat ? [hat.lga, hat.country].filter(Boolean).join(', ') : ''
  const availabilityWindow = hat ? formatAvailabilityWindow(hat) : ''
  const isOwn = !!hat && !!user && hat.user_id === user.id
  const owner = identityFromHat(hat)
  const ownerName = getPrimaryIdentity(owner)
  const hasRelated = related.length > 0

  // Re-read the Hat before acting so Range/fixed pricing is current. Range
  // pricing opens the first proposal directly; fixed pricing still books
  // without a negotiation step.
  async function handleBook() {
    if (!hat || checkingRef.current || negotiationStep) return
    checkingRef.current = true
    setChecking(true)
    try {
      const { hat: fresh } = await api.getHat(hat.id)
      if (!fresh || fresh.active === false || fresh.role !== 'talent') {
        onNotify?.('This talent is no longer available to book.')
        return
      }
      setBookCandidate(fresh)
      const usesNegotiationPricing =
        fresh.price_type === 'range' || Boolean(fresh.price_negotiable)

      if (usesNegotiationPricing) {
        setNegotiationStep('proposal')
        return
      }

      await bookHat(fresh, navigate)
    } catch {
      onNotify?.("Couldn't check this price. Please try again.")
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  async function handleProposalSubmit(proposal) {
    const target = bookCandidate || hat
    if (!target) return null
    const result = await bookHat(target, navigate, proposal)
    if (result) setNegotiationStep(null)
    return result
  }

  function cancelNegotiation() {
    setNegotiationStep(null)
    bookRef.current?.focus?.()
  }

  const labelId = 'sr-detail-title'

  return createPortal(
    <>
      <div {...backdrop} className="sr-overlay">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          tabIndex={-1}
          className="sr-panel animate-slide-up outline-none"
        >
          <header className="sr-head shrink-0 flex items-center gap-2 px-3 md:px-4 border-b border-black/10 bg-white">
            {hat ? (
              <UserIdentity
                user={owner}
                className="min-h-[44px] flex-1"
                nameId={labelId}
                nameBadge={hat.is_verified ? <span className="text-[#0A13E6] ml-1">✓</span> : null}
              >
                <p className="text-[11px] text-black/50 leading-tight truncate">
                  {[timeAgo(hat.created_at), location].filter(Boolean).join(' · ')}
                </p>
              </UserIdentity>
            ) : (
              <h2 id={labelId} className="flex-1 font-bold text-[15px]">
                Showroom
              </h2>
            )}
            {hat && (
              <button type="button" onClick={() => onShare(hat)} aria-label={`Share post by ${ownerName}`} className={iconBtn}>
                <Share2 size={17} aria-hidden="true" />
                <span className="hidden sm:inline">Share</span>
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 shrink-0 rounded-full border-[1.5px] border-black bg-[#F5F3EF] flex items-center justify-center hover:bg-black hover:text-white transition"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {status === 'ready' && hat ? (
            <div ref={bodyRef} className={`sr-body ${hasRelated ? '' : 'sr-body--solo'}`}>
              <div ref={mainRef} className="sr-main">
                <div className="sr-stage" style={aspect ? { '--sr-aspect': aspect } : undefined}>
                  <ShowroomMedia
                    media={media}
                    alt={caption || `${ownerName}'s Showroom post`}
                    playing
                    muted={muted}
                    onMutedChange={onMutedChange}
                    onDimensions={({ w, h }) => w && h && setAspect(w / h)}
                    width={1600}
                  />
                </div>

                <div className="sr-actions flex items-center gap-0.5 px-2 md:px-3 border-b border-black/10">
                  <button
                    type="button"
                    onClick={() => onLike(hat.id)}
                    aria-pressed={!!hat.liked_by_me}
                    aria-label={`${hat.liked_by_me ? 'Unlike' : 'Like'}${hat.likes ? `, ${hat.likes} likes` : ''}`}
                    className={iconBtn}
                  >
                    <Heart size={18} className={hat.liked_by_me ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} aria-hidden="true" />
                    <span>{hat.likes > 0 ? hat.likes : 'Like'}</span>
                  </button>
                  <button type="button" onClick={() => onShare(hat)} aria-label={`Share post by ${ownerName}`} className={iconBtn}>
                    <Share2 size={17} aria-hidden="true" />
                    <span>Share</span>
                  </button>
                  {!isOwn && (
                    <button
                      ref={bookRef}
                      type="button"
                      onClick={handleBook}
                      aria-disabled={checking}
                      className={`ml-auto h-11 px-5 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black inline-flex items-center gap-2 transition hover:bg-black active:scale-95 ${checking ? 'opacity-60' : ''}`}
                    >
                      <BookOpen size={15} aria-hidden="true" />
                      {checking ? 'Checking…' : 'Book'}
                    </button>
                  )}
                </div>

                <div className="p-4 md:p-5 space-y-3">
                  {caption && <p className="text-[14px] leading-relaxed text-black/85 whitespace-pre-line break-words">{caption}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-black/60">
                    {hat.hat_title && <span className="font-semibold text-black/80">{hat.hat_title}</span>}
                    <span className="font-semibold text-black/80">{formatPrice(hat, hat.currency || 'NGN')}</span>
                    <AvailabilityBadge
                      available={hat.availability}
                      className={hat.availability ? '' : '!bg-transparent !text-black/55 !border-black/25'}
                    />
                    {availabilityWindow && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} aria-hidden="true" /> {availabilityWindow}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Eye size={13} aria-hidden="true" /> {hat.views || 0} views
                    </span>
                    {location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} aria-hidden="true" /> {location}
                      </span>
                    )}
                  </div>
                  {(hat.category || hat.skills?.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {[hat.category, ...(hat.skills || [])].filter(Boolean).slice(0, 8).map((t) => (
                        <span key={t} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#F5F3EF] border border-black/10 text-black/65">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {hasRelated && (
                <aside className="sr-rail" aria-label="Related Showroom">
                  <p className="tw-label px-4 pt-4 pb-2">Related Showroom</p>
                  <ul className="px-2 pb-4 space-y-0.5">
                    {related.map((h) => (
                      <RelatedItem key={h.id} hat={h} onSelect={onSelect} />
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              {status === 'loading' && <p className="text-black/45 text-[13px] font-medium">Loading post…</p>}
              {status === 'unavailable' && (
                <>
                  <p className="font-bold text-[16px]">This post isn’t available</p>
                  <p className="text-black/55 text-[13px] max-w-xs">It may have been removed, or the link may be wrong.</p>
                  <button type="button" onClick={onClose} className="tw-btn-primary h-11 px-6 text-[13px]">
                    Back to Showroom
                  </button>
                </>
              )}
              {status === 'error' && (
                <>
                  <p className="font-bold text-[16px]">Couldn’t load this post</p>
                  <p className="text-black/55 text-[13px]">Check your connection and try again.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={onRetry} className="tw-btn-primary h-11 px-6 text-[13px]">
                      Try again
                    </button>
                    <button type="button" onClick={onClose} className="tw-btn-ghost h-11 px-6 text-[13px]">
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <NegotiationProposalModal
        open={negotiationStep === 'proposal'}
        min={(bookCandidate || hat)?.price_min}
        max={(bookCandidate || hat)?.price_max}
        currency={(bookCandidate || hat)?.currency || 'NGN'}
        payUnit={
          (bookCandidate || hat)?.rate_unit === 'custom'
            ? (bookCandidate || hat)?.rate_unit_custom
            : (bookCandidate || hat)?.rate_unit
        }
        actionLabel="Send booking proposal"
        onCancel={cancelNegotiation}
        onSubmit={handleProposalSubmit}
      />
    </>,
    document.body,
  )
}
