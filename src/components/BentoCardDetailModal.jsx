// Path: src/components/BentoCardDetailModal.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, BookOpen, Send, Lock, Unlock, AlertCircle, Play, ImageOff, Eye } from 'lucide-react'
import { api } from '../lib/api'
import {
  HatOwnerHeader,
  NegotiationFeeNotice,
  formatAvailabilityWindow,
  formatBudget,
  formatPrice,
  relativeTime,
  useLikeToggle,
} from './bentoCardShared'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'
import { getPrimaryIdentity, identityFromHat } from '../lib/profile.js'
import UserIdentity from './UserIdentity'

// Publication date, shared by the feed's `created_at` and the detail
// API's `created_at` — same underlying column either way.
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

// A labeled section of the decision surface — "About", "Skills",
// "Availability", etc. Renders nothing at all when there's no value, per
// the spec's "do not render empty sections" rule, so callers can just
// always include every section without an if/else at each call site.
function DetailSection({ label, children }) {
  if (!children) return null
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-black/40">{label}</p>
      <div className="text-[13.5px] text-black/80 mt-0.5">{children}</div>
    </div>
  )
}

function EscrowBadge({ hat, escrow }) {
  const funded = escrow?.status === 'secured' || escrow?.status === 'released'
  const fallback = hat.price_type === 'range' ? hat.price_min : hat.rate
  const amount = escrow?.amount ?? fallback ?? 0

  if (funded) {
    return (
      <div className="escrow-secured inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#E8FFE6] text-[#0A7A00] text-[12px] font-semibold border-[1.5px] border-[#0A7A00]/20">
        <Unlock size={14} /> ₦{Number(amount).toLocaleString()} Secured • Contacts Unlocked
      </div>
    )
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#E6F0FF] text-[#0A13E6] text-[12px] font-semibold border-[1.5px] border-[#0A13E6]/20">
      <Lock size={14} /> Escrow: Not Funded • Contacts Locked
    </div>
  )
}

// The BentoCard detail modal — the app's Hat *decision* surface (as
// opposed to BentoCard's discovery surface). Also reused, unmodified, by
// HatPage.jsx for the directly-shareable /hat/:hatId route — that page
// just supplies its own onClose (navigate back) instead of closing a
// card overlay.
//
// BentoCard still owns the `open` state and only mounts this component
// while open, so the body-scroll lock here runs on mount/unmount, which
// is equivalent to the previous `open`-driven effect.
//
// `hat` is the partial feed card — shown immediately for continuity. On
// mount (and whenever the card id changes) this also fetches the full
// GET /api/hats/:id?include=owner detail and, once loaded, that becomes
// the source of truth for title/description/media/tags/category/budget/
// location/owner/has_applied/has_booked. Fields the normalized detail
// doesn't carry (hat_type, delivery_mode, the availability window) have
// no API equivalent, so they keep coming from the feed card throughout.
//
// Engagement (likes/views) is also one of those fields: buildCardDetail
// (api/hats/[id].js) never includes likes/liked_by_me/views, so those
// always come from the feed's `hat`, mirroring the same optimistic
// like-toggle + rollback used in Showroom's ReelSlide and TalentProfile —
// same api.toggleLike/api.recordView calls, no new endpoints (the actual
// toggle now lives in bentoCardShared's useLikeToggle, shared with
// BentoCard's own header like-button).
//
// `onHatChange`, if given, is called with `{ id, ...patch }` after a
// successful like/view so the parent (Feed) can patch its own `hats`
// list — otherwise the feed card behind the modal would show stale
// counts once the modal closes, with no full refetch required.
export default function BentoCardDetailModal({ hat, escrow, showMedia = true, onClose, onBook, onApply, onHatChange }) {
  // Focus something useful inside the dialog on open, and restore focus to
  // whatever triggered the modal once it closes, in addition to the
  // existing scroll-lock/restore behavior.
  const panelRef = useRef(null)
  useEffect(() => {
    const scrollY = window.scrollY
    const previouslyFocused = document.activeElement
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
    document.body.style.top = `-${scrollY}px`
    panelRef.current?.focus()
    return () => {
      document.documentElement.classList.remove('modal-open')
      document.body.classList.remove('modal-open')
      document.body.style.top = ''
      window.scrollTo(0, scrollY)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  // Escape closes the modal, same as clicking the overlay or the close
  // button. Bound/unbound per mount, so repeated open/close cycles never
  // stack up duplicate listeners.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const cardId = hat?.id ?? null

  const [detail, setDetail] = useState(null)
  // 'idle' (no id to fetch) | 'loading' | 'success' | 'error'
  const [status, setStatus] = useState(cardId ? 'loading' : 'idle')
  const [errorMessage, setErrorMessage] = useState(null)

  // Which of this card's media items is shown in the main viewer, and
  // which indices have failed to load (per-item, so one broken item
  // doesn't take out the whole gallery). Reset whenever the modal is
  // pointed at a different card.
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [brokenMedia, setBrokenMedia] = useState(() => new Set())
  const markMediaBroken = useCallback((idx) => {
    setBrokenMedia((prev) => (prev.has(idx) ? prev : new Set(prev).add(idx)))
  }, [])
  useEffect(() => {
    setActiveMediaIndex(0)
    setBrokenMedia(new Set())
  }, [cardId])

  const { liked, liking, toggle: handleLike } = useLikeToggle({
    id: cardId,
    liked: hat?.liked_by_me,
    count: hat?.likes,
    onHatChange,
  })

  const [viewCount, setViewCount] = useState(hat?.views || 0)
  const viewedRef = useRef(null)

  // Applying — onApply is owned by the parent (Feed/Showroom), so this is
  // just an optimistic local flag set once that call settles, plus
  // whatever the detail fetch already knows (has_applied) once loaded.
  const [applying, setApplying] = useState(false)
  const [justApplied, setJustApplied] = useState(false)
  // The negotiation-fee confirmation from the spec — only ever relevant
  // to a talent hat's "Book" action when the price is negotiable; see
  // handlePrimaryAction below.
  const [showNegotiationNotice, setShowNegotiationNotice] = useState(false)

  useEffect(() => {
    setViewCount(hat?.views || 0)
    setJustApplied(false)
  }, [cardId, hat?.views])

  // Record one view per card per time the modal is open — same
  // fire-and-forget api.recordView call TalentProfile/Showroom make, with
  // the same "don't surface view-count failures" behavior.
  useEffect(() => {
    if (!cardId || viewedRef.current === cardId) return
    viewedRef.current = cardId
    setViewCount((v) => {
      const next = v + 1
      onHatChange?.({ id: cardId, views: next })
      return next
    })
    api.recordView(cardId).catch(() => {})
  }, [cardId, onHatChange])

  // Tracks the most recently *issued* request so a slow, older response
  // (e.g. Card A) can't overwrite a newer one (Card B) if the user opens
  // cards in quick succession while this component stays mounted.
  const latestRequestId = useRef(0)
  // Tracks the id that's currently loaded/loading, so we don't refetch
  // when the same card is already loaded.
  const loadedCardId = useRef(null)

  const fetchDetail = useCallback((id) => {
    const requestId = ++latestRequestId.current
    setStatus('loading')
    setErrorMessage(null)
    api
      .getHatDetail(id)
      .then((data) => {
        if (latestRequestId.current !== requestId) return // stale — a newer request won
        loadedCardId.current = id
        setDetail(data)
        setStatus('success')
      })
      .catch((err) => {
        if (latestRequestId.current !== requestId) return
        setErrorMessage(err?.message || 'Failed to load details')
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    if (!cardId) {
      // No valid card id to fetch — fall back to whatever the feed gave
      // us instead of calling the API with an invalid value.
      latestRequestId.current++ // invalidate any in-flight request
      loadedCardId.current = null
      setDetail(null)
      setStatus('idle')
      return
    }
    if (loadedCardId.current === cardId) return // already loaded/loading this card
    fetchDetail(cardId)
  }, [cardId, fetchDetail])

  function handleRetry() {
    if (cardId) fetchDetail(cardId)
  }

  const loaded = status === 'success' && detail
  const owner = loaded ? detail.owner : null

  const isTalent = (owner?.role ?? hat.role) === 'talent'
  // Both the feed's partial hat and the full detail carry the same shape:
  // an ordered array of { url, type, caption }, newest first (see
  // AddShowroomMedia's "prepend to front" comment). Drop entries with no
  // url up front — those can never render anything, image/video error
  // handlers below cover urls that are present but fail to load.
  const rawMedia = loaded ? detail.media : hat.media
  const mediaItems = Array.isArray(rawMedia) ? rawMedia.filter((m) => m?.url) : []
  const hasMedia = mediaItems.length > 0
  // Clamp defensively in case the list is ever shorter than the last
  // selected index (e.g. the fuller detail response has fewer items than
  // the feed card did).
  const safeMediaIndex = hasMedia ? Math.min(activeMediaIndex, mediaItems.length - 1) : 0
  const activeMedia = hasMedia ? mediaItems[safeMediaIndex] : null
  const activeMediaBroken = brokenMedia.has(safeMediaIndex)
  // The owner's identity (full name + handle, or business name + username —
  // see lib/profile.js) comes from the hat record; once the full detail has
  // loaded, its owner block only fills in what the record lacked. `owner.name`
  // is "full name or username" (api/hats/[id].js), so it only counts as a
  // full name when it differs from the handle.
  const cardIdentity = identityFromHat(hat)
  const ownerHandle = owner?.handle || ''
  const identity = {
    ...cardIdentity,
    username: cardIdentity.username || ownerHandle,
    fullName: cardIdentity.fullName || (owner?.name && owner.name !== ownerHandle ? owner.name : ''),
    avatarUrl: owner?.avatar_url || cardIdentity.avatarUrl,
  }
  const displayName = getPrimaryIdentity(identity) || null
  const isVerified = loaded ? Boolean(owner?.is_verified) : Boolean(hat.is_verified)
  const category = loaded ? detail.category : hat.category
  // Owner-level profile fields — only present once the full detail has
  // loaded; the feed card carries no equivalent for either.
  const ownerLocation = loaded ? owner?.location : null
  // Card title — the primary heading for the detail view.
  const titleLine = loaded ? detail.title : hat.hat_title
  // Full description/content — no truncation and no role gate here; this
  // is the detail view, not the feed preview. Shown whenever the card
  // actually has one.
  const description = loaded ? detail.description : hat.motto
  const tags = (loaded ? detail.tags : hat.skills) || []
  const listingLabel = isTalent ? 'Seeking' : 'Hiring'
  const currency = (loaded ? detail.budget?.currency : hat.currency) || 'NGN'
  // Talent's specific location — LGA/city + country, not just a bare city name.
  const location = loaded ? detail.location : [hat.lga, hat.country].filter(Boolean).join(', ')
  // No equivalent in the normalized detail — always sourced from the feed card.
  const availabilityWindow = formatAvailabilityWindow(hat)
  const hiringDuration = loaded ? detail.hiring_duration : hat.hiring_duration
  const priceDisplay = loaded ? formatBudget(detail.budget) : formatPrice(hat, currency)
  const usesNegotiationPricing = loaded
    ? detail.budget?.type === 'range' || Boolean(detail.budget?.negotiable)
    : hat.price_type === 'range' || Boolean(hat.price_negotiable)
  const publishedLabel = formatDate(loaded ? detail.created_at : hat.created_at)
  const postedAgo = relativeTime(loaded ? detail.created_at : hat.created_at)
  const applied = (loaded && Boolean(detail.has_applied)) || justApplied

  // Both Book and Apply must acknowledge the fee before continuing when
  // the Hat uses Range or legacy negotiable pricing.
  function runPrimaryAction() {
    if (isTalent) {
      onBook?.(hat)
      return
    }
    if (applied || applying) return
    setApplying(true)
    Promise.resolve(onApply?.(hat))
      .then(() => setJustApplied(true))
      .finally(() => setApplying(false))
  }

  function handlePrimaryAction() {
    if (!isTalent && (applied || applying)) return
    if (usesNegotiationPricing) {
      setShowNegotiationNotice(true)
      return
    }
    runPrimaryAction()
  }

  function handleNegotiationContinue() {
    setShowNegotiationNotice(false)
    runPrimaryAction()
  }

  return (
    <div
      className="modal-overlay md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titleLine || 'Card details'}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="modal-panel animate-slide-up outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-[720px] mx-auto w-full">
        <div className="p-4 md:p-5 pb-3 space-y-3">
          <HatOwnerHeader
            identity={
              <UserIdentity
                user={identity}
                avatarClassName="w-11 h-11"
                nameClassName="font-semibold text-[14px] leading-tight"
                nameBadge={isVerified ? <span className="text-[#0A13E6]">✓</span> : null}
                fallbackLabel="Unknown creator"
              >
                <p className="text-[11px] text-black/50 font-medium truncate">
                  {[isTalent ? 'Talent' : 'Client', ownerLocation || location, postedAgo].filter(Boolean).join(' • ')}
                </p>
              </UserIdentity>
            }
            hatId={cardId}
            shareTitle={titleLine}
            shareContext={`${listingLabel}: ${titleLine}`}
            liked={liked}
            onToggleLike={handleLike}
            likeDisabled={liking}
            onClose={onClose}
          />

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">{listingLabel}</p>
            <h2 className="text-[19px] md:text-[20px] font-bold leading-snug break-words">{titleLine}</h2>
          </div>
        </div>

        {showMedia && (
          <div className="modal-media bg-[#F5F3EF] min-h-[240px] border-y-[1.5px] border-black flex flex-col">
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              {hasMedia && !activeMediaBroken ? (
                activeMedia.type === 'video' ? (
                  <video
                    key={activeMedia.url}
                    src={cldVideo(activeMedia.url, { w: 1080 })}
                    poster={cldVideoPoster(activeMedia.url, { w: 1080, crop: 'limit' })}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain max-h-[70vh]"
                    aria-label={activeMedia.caption || `${displayName || 'Portfolio'} video`}
                    onError={() => markMediaBroken(safeMediaIndex)}
                  />
                ) : (
                  <img
                    key={activeMedia.url}
                    src={cldImage(activeMedia.url, { w: 1080, crop: 'limit' })}
                    alt={activeMedia.caption || (displayName ? `${displayName}'s work` : 'Portfolio media')}
                    className="w-full h-full object-contain max-h-[70vh]"
                    onError={() => markMediaBroken(safeMediaIndex)}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-64 text-black/30 text-[13px]">
                  {hasMedia ? 'This media couldn\u2019t be loaded' : 'No portfolio'}
                </div>
              )}
            </div>

            {mediaItems.length > 1 && (
              <div
                role="group"
                aria-label="Portfolio media thumbnails"
                className="flex gap-1.5 p-2 overflow-x-auto shrink-0 border-t-[1.5px] border-black/10 bg-white/60"
              >
                {mediaItems.map((m, idx) => {
                  const broken = brokenMedia.has(idx)
                  const selected = idx === safeMediaIndex
                  return (
                    <button
                      key={`${m.url}-${idx}`}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`View ${m.type === 'video' ? 'video' : 'photo'} ${idx + 1} of ${mediaItems.length}`}
                      onClick={() => setActiveMediaIndex(idx)}
                      className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border-[1.5px] transition ${
                        selected ? 'border-[#0A13E6]' : 'border-black/10 hover:border-black/30'
                      }`}
                    >
                      {broken ? (
                        <div className="w-full h-full flex items-center justify-center bg-[#F5F3EF] text-black/25">
                          <ImageOff size={14} />
                        </div>
                      ) : m.type === 'video' ? (
                        <div className="relative w-full h-full bg-black">
                          <img
                            src={cldVideoPoster(m.url, { w: 112, h: 112 })}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover opacity-70"
                            onError={() => markMediaBroken(idx)}
                          />
                          <Play size={12} className="absolute inset-0 m-auto text-white" fill="white" />
                        </div>
                      ) : (
                        <img
                          src={cldImage(m.url, { w: 112, h: 112 })}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => markMediaBroken(idx)}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="p-4 md:p-5 space-y-4 min-w-0">
          {publishedLabel && <p className="text-[11px] text-black/40 font-medium">Posted {publishedLabel}</p>}

          {status === 'loading' && (
            <p className="text-[11px] text-black/40 font-medium">Loading full details…</p>
          )}

          {status === 'error' && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-[#FFF3F0] border-[1.5px] border-[#E6260A]/20 text-[#E6260A]">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                <AlertCircle size={14} /> {errorMessage || 'Couldn\u2019t load full details.'}
              </span>
              <button
                type="button"
                onClick={handleRetry}
                className="shrink-0 text-[12px] font-bold underline underline-offset-2 hover:opacity-70"
              >
                Retry
              </button>
            </div>
          )}

          <DetailSection label={isTalent ? 'About' : 'Requirements'}>
            {description && <p className="leading-relaxed break-words whitespace-pre-line">{description}</p>}
          </DetailSection>

          <DetailSection label={isTalent ? 'Skills' : 'Required skills'}>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map((t, i) => (
                  <span
                    key={`${t}-${i}`}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#F5F3EF] border border-black/10 text-black/60"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <div className="grid grid-cols-2 gap-3">
            <DetailSection label="Availability">
              {availabilityWindow && (
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {availabilityWindow}
                </span>
              )}
            </DetailSection>
            <DetailSection label="Delivery">{hat.delivery_mode}</DetailSection>
          </div>

          {!isTalent && hiringDuration && <DetailSection label="Hiring duration">{hiringDuration}</DetailSection>}

          <DetailSection label="Location">{location}</DetailSection>

          <DetailSection label={isTalent ? 'Price' : 'Budget'}>
            <span className="text-[16px] font-bold">{priceDisplay}</span>
          </DetailSection>

          {category && (
            <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10">
              {category}
            </span>
          )}

          <div className="flex items-center gap-3 text-[12px] text-black/50 font-medium">
            <span className="flex items-center gap-1">
              <Eye size={14} /> {viewCount} view{viewCount === 1 ? '' : 's'}
            </span>
          </div>

          <EscrowBadge hat={hat} escrow={escrow} />

          <div className="sticky bottom-0 -mx-4 md:-mx-5 -mb-4 md:-mb-5 px-4 md:px-5 py-3 bg-white border-t-[1.5px] border-black/10 flex gap-2">
            <button
              type="button"
              disabled={!isTalent && (applying || applied)}
              className={`flex-1 h-12 rounded-full text-white font-semibold text-[14px] border-[1.5px] border-black flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(10,19,230,0.25)] hover:bg-black transition disabled:opacity-60 ${
                isTalent ? 'bg-[#0A13E6]' : 'bg-black'
              }`}
              onClick={handlePrimaryAction}
            >
              {isTalent ? <BookOpen size={16} /> : <Send size={16} />}
              {isTalent ? 'Book' : applying ? 'Applying…' : applied ? 'Applied' : 'Apply'}
            </button>
          </div>
        </div>
        </div>
      </div>

      <NegotiationFeeNotice
        open={showNegotiationNotice}
        onCancel={() => setShowNegotiationNotice(false)}
        onContinue={handleNegotiationContinue}
      />
    </div>
  )
}