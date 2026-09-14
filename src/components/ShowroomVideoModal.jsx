import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, Heart, Eye, MapPin, Play } from 'lucide-react'
import { api } from '../lib/api'
import { Avatar } from './bentoCardShared'
import AvailabilityBadge from './AvailabilityBadge'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'

// YouTube-style "expanded" popup for a Showroom video. The active video
// plays large up top with native controls (same pattern as
// BentoCardDetailModal's media viewer) and the creator's info sits right
// below it — but unlike BentoCardDetailModal, whose strip under the player
// is that *same* card's own extra media, this rail holds *other* Showroom
// talents' videos, so tapping one swaps the player in place without
// closing the popup (mirrors YouTube's "up next" list).
//
// `hats` is the same filtered/search-matched list Showroom's reel is
// currently showing, so the rail always matches whatever the reel itself
// would scroll through next.
//
// Engagement (likes/views) isn't kept as local state here — every card in
// `hats` (the active one included) belongs to the parent Showroom's own
// list, so an optimistic like/view is reported straight up via
// `onHatChange` and read back down through `hats`. That's the same
// "patch the shared list" pattern Feed/BentoCardDetailModal already use,
// and it keeps the rail's own like/view counts in sync with whichever
// card is currently active, with no separate copy of the numbers that
// could drift.
export default function ShowroomVideoModal({
  hats,
  activeId,
  onSelect,
  onClose,
  muted,
  onSetMuted,
  onHatChange,
}) {
  const videoRef = useRef(null)
  const closeButtonRef = useRef(null)
  const viewedIdsRef = useRef(new Set())
  const likingIdsRef = useRef(new Set())

  const activeHat = hats.find((h) => h.id === activeId) || null
  const media = activeHat?.media?.[0]
  const isVideo = media?.type === 'video' && !!media?.url

  // Body-scroll lock + focus management — same shape as
  // BentoCardDetailModal's identical effect, so the two popups behave
  // identically to the rest of the app.
  useEffect(() => {
    const scrollY = window.scrollY
    const previouslyFocused = document.activeElement
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
    document.body.style.top = `-${scrollY}px`
    closeButtonRef.current?.focus()
    return () => {
      document.documentElement.classList.remove('modal-open')
      document.body.classList.remove('modal-open')
      document.body.style.top = ''
      window.scrollTo(0, scrollY)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Record one view per card per popup session, then (re)play whichever
  // video just became active — mirrors ReelSlide's autoplay-with-fallback
  // so picking a rail video feels the same as scrolling to a new slide.
  useEffect(() => {
    if (!activeHat) return
    if (!viewedIdsRef.current.has(activeHat.id)) {
      viewedIdsRef.current.add(activeHat.id)
      onHatChange?.({ id: activeHat.id, views: (activeHat.views || 0) + 1 })
      api.recordView(activeHat.id).catch(() => {})
    }
    const video = videoRef.current
    if (!isVideo || !video) return
    video.muted = muted
    const playPromise = video.play()
    if (playPromise?.catch) {
      playPromise.catch(() => {
        if (!video.muted) {
          video.muted = true
          onSetMuted?.(true)
          video.play().catch(() => {})
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHat?.id, isVideo])

  // Keep the live element in sync whenever the shared mute preference
  // changes elsewhere (e.g. the reel behind this popup).
  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = muted
  }, [muted])

  async function handleLike() {
    if (!activeHat || likingIdsRef.current.has(activeHat.id)) return
    likingIdsRef.current.add(activeHat.id)
    const next = !activeHat.liked_by_me
    const prevLikes = activeHat.likes || 0
    onHatChange?.({ id: activeHat.id, liked_by_me: next, likes: prevLikes + (next ? 1 : -1) })
    try {
      await api.toggleLike(activeHat.id)
    } catch {
      onHatChange?.({ id: activeHat.id, liked_by_me: !next, likes: prevLikes })
    } finally {
      likingIdsRef.current.delete(activeHat.id)
    }
  }

  if (!activeHat) return null

  const rail = hats.filter((h) => h.id !== activeHat.id)

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${activeHat.username}'s showroom video`}
      onClick={onClose}
    >
      <div className="modal-panel animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="modal-close absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-[#F5F3EF] border-[1.5px] border-black flex items-center justify-center hover:bg-black hover:text-white transition"
        >
          <X size={16} />
        </button>

        <div className="bg-black flex items-center justify-center min-h-[240px] max-h-[70vh]">
          {media?.url ? (
            isVideo ? (
              <video
                key={media.url}
                ref={videoRef}
                src={cldVideo(media.url, { w: 1080 })}
                poster={cldVideoPoster(media.url, { w: 1080, crop: 'limit' })}
                controls
                loop
                playsInline
                autoPlay
                className="w-full max-h-[70vh] object-contain"
              />
            ) : (
              <img
                key={media.url}
                src={cldImage(media.url, { w: 1080, crop: 'limit' })}
                alt=""
                className="w-full max-h-[70vh] object-contain"
              />
            )
          ) : (
            <div className="w-full h-64 flex items-center justify-center text-white/30 text-[13px] font-medium">
              No media
            </div>
          )}
        </div>

        <div className="p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={activeHat.owner_avatar} name={activeHat.username} className="w-11 h-11" />
              <div className="min-w-0">
                <p className="font-bold text-[15px] flex items-center gap-1 truncate">
                  {activeHat.username}
                  {activeHat.is_verified && <span className="text-[#0A13E6]">✓</span>}
                  {activeHat.isHost && (
                    <span className="ml-1 bg-[#FFBD2E] text-black text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border-[1.5px] border-black">
                      Host
                    </span>
                  )}
                </p>
                {activeHat.lga && (
                  <p className="text-[11px] text-black/50 font-medium flex items-center gap-1 mt-0.5">
                    <MapPin size={11} /> {[activeHat.lga, activeHat.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
            <AvailabilityBadge available={activeHat.availability} />
          </div>

          {(media?.caption || activeHat.motto) && (
            <p className="text-[13px] text-black/70 leading-relaxed">{media?.caption || activeHat.motto}</p>
          )}

          <div className="flex items-center gap-4">
            <Link
              to={`/talent/${activeHat.id}`}
              className="h-10 px-5 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black flex items-center justify-center"
            >
              Book
            </Link>
            <button
              type="button"
              onClick={handleLike}
              aria-pressed={!!activeHat.liked_by_me}
              aria-label={activeHat.liked_by_me ? 'Unlike' : 'Like'}
              className="flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-70 transition"
            >
              <Heart size={16} className={activeHat.liked_by_me ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} />
              {activeHat.likes || 0}
            </button>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-black/50">
              <Eye size={16} /> {activeHat.views || 0}
            </span>
          </div>

          {rail.length > 0 && (
            <div className="pt-2 border-t-[1.5px] border-black/10">
              <p className="tw-label mb-3">More from Showroom</p>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {rail.map((h) => {
                  const m = h.media?.[0]
                  const vid = m?.type === 'video' && !!m?.url
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onSelect(h.id)}
                      aria-label={`Play ${h.username}'s video`}
                      className="relative shrink-0 w-[118px] h-[196px] rounded-2xl overflow-hidden border-[1.5px] border-black bg-black text-left"
                    >
                      {m?.url ? (
                        vid ? (
                          <img
                            src={cldVideoPoster(m.url, { w: 236, h: 392 })}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={cldImage(m.url, { w: 236, h: 392 })}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/25 text-[10px] font-medium">
                          No media
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      {vid && <Play size={20} className="absolute inset-0 m-auto text-white/85" fill="white" />}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-[11px] font-bold truncate">{h.username}</p>
                        <p className="flex items-center gap-1 text-white/75 text-[10px] font-medium mt-0.5">
                          <Heart size={9} className={h.liked_by_me ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} />
                          {h.likes || 0}
                          <Eye size={9} className="ml-1" />
                          {h.views || 0}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}