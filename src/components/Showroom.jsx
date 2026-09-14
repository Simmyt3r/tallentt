import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Heart, MapPin, Eye, Play, Pause, Volume2, VolumeX, Maximize2, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import AvailabilityBadge from './AvailabilityBadge'
import AddShowroomMedia from './AddShowroomMedia'
import ShowroomVideoModal from './ShowroomVideoModal'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// One full-screen reel slide. Only plays its video while `active` — i.e.
// it's the slide currently snapped into view — driven by a single shared
// observer up in Showroom rather than one per slide, so exactly one video
// plays at a time. Also fires a view once, and lets the viewer like it.
//
// `muted` / `onSetMuted` are lifted to the parent so the mute preference
// carries across slides as the user scrolls, matching typical reel UX.
function ReelSlide({ hat, active, muted, onSetMuted, onExpand }) {
  const videoRef = useRef(null)
  const slideRef = useRef(null)
  const progressRef = useRef(null)
  const viewedRef = useRef(false)
  const media = hat.media?.[0]
  const isVideo = media?.type === 'video' && !!media?.url

  const [liked, setLiked] = useState(!!hat.liked_by_me)
  const [likeCount, setLikeCount] = useState(hat.likes || 0)
  const [viewCount, setViewCount] = useState(hat.views || 0)
  const [liking, setLiking] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setLiked(!!hat.liked_by_me)
    setLikeCount(hat.likes || 0)
    setViewCount(hat.views || 0)
  }, [hat.id, hat.liked_by_me, hat.likes, hat.views])

  useEffect(() => {
    const video = videoRef.current
    if (!isVideo) return
    if (active) {
      if (!viewedRef.current) {
        viewedRef.current = true
        setViewCount((v) => v + 1)
        api.recordView(hat.id).catch(() => {})
      }
      if (video) {
        // Try to honor the shared mute preference (which defaults to
        // unmuted, so videos keep their original audio by default). If the
        // browser blocks autoplay-with-sound, fall back to muted autoplay
        // and let the user unmute via the control — never get stuck silent
        // forever, and never force `muted` permanently in markup.
        video.muted = muted
        const playPromise = video.play()
        if (playPromise?.catch) {
          playPromise.catch(() => {
            if (!video.muted) {
              video.muted = true
              onSetMuted(true)
              video.play().catch(() => {})
            }
          })
        }
      }
    } else if (video) {
      video.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hat.id, isVideo])

  // Keep the live element in sync whenever the shared mute preference
  // changes (e.g. user taps unmute on any slide).
  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => setCurrentTime(video.currentTime)
    const onMeta = () => setDuration(video.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onMeta)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onMeta)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
    }
  }, [media?.url])

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || null
      setIsFullscreen(!!fsEl && (fsEl === slideRef.current || fsEl === videoRef.current))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  async function handleLike() {
    if (liking) return
    setLiking(true)
    const next = !liked
    setLiked(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    try {
      await api.toggleLike(hat.id)
    } catch (e) {
      setLiked(!next)
      setLikeCount((c) => c + (next ? -1 : 1))
    } finally {
      setLiking(false)
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function handleSeek(e) {
    const track = progressRef.current
    const video = videoRef.current
    if (!track || !video || !duration) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    video.currentTime = ratio * duration
    setCurrentTime(video.currentTime)
  }

  function handleFullscreen() {
    const video = videoRef.current
    if (!video) return
    // iOS Safari only supports native fullscreen on the <video> element
    // itself — arbitrary-element Fullscreen API isn't available there.
    if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      return
    }
    const target = slideRef.current || video
    const request =
      target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen
    if (request) request.call(target)
  }

  return (
    <div ref={slideRef} data-hat-id={hat.id} className="reel-slide">
      {media?.url ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={cldVideo(media.url, { w: 720 })}
            poster={cldVideoPoster(media.url, { w: 480 })}
            className={`absolute inset-0 w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`}
            loop
            playsInline
            preload="metadata"
            onClick={togglePlay}
          />
        ) : (
          <img
            src={cldImage(media.url, { w: 720 })}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[13px] font-medium">
          No media
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

      {hat.isHost && (
        <span className="absolute top-3 left-3 z-10 bg-[#FFBD2E] text-black text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border-[1.5px] border-black shadow">
          Showroom Host
        </span>
      )}

      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
        <AvailabilityBadge available={hat.availability} />
        {isVideo && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSetMuted(!muted)}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
              className="w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center border border-white/20"
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              aria-label="Fullscreen"
              className="w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center border border-white/20"
            >
              <Maximize2 size={12} />
            </button>
            <button
              type="button"
              onClick={() => onExpand?.(hat.id)}
              aria-label="Open with more videos"
              title="Open with more videos"
              className="w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center border border-white/20"
            >
              <LayoutGrid size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="relative z-10 w-full p-4 sm:p-5 text-white">
        {isVideo && (
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause video' : 'Play video'}
              className="w-7 h-7 shrink-0 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center border border-white/20"
            >
              {playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
            </button>
            <div
              ref={progressRef}
              onClick={handleSeek}
              role="slider"
              tabIndex={0}
              aria-label="Seek video"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration) || 0}
              aria-valuenow={Math.round(currentTime) || 0}
              className="flex-1 h-1.5 rounded-full bg-white/25 cursor-pointer relative"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-white/80 tabular-nums shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        )}

        <p className="font-bold text-[16px] leading-tight flex items-center gap-1">
          {hat.username}
          {hat.is_verified && <span className="text-[#7C9CFF]">✓</span>}
        </p>
        {(media?.caption || hat.motto) && (
          <p className="text-[13px] text-white/85 italic leading-snug mt-1 line-clamp-2">
            "{media?.caption || hat.motto}"
          </p>
        )}
        {hat.lga && (
          <p className="text-[11px] text-white/70 font-medium mt-1.5 flex items-center gap-1">
            <MapPin size={11} /> {[hat.lga, hat.country].filter(Boolean).join(', ')}
          </p>
        )}
        <div className="flex items-center gap-3 mt-3">
          <Link
            to={`/talent/${hat.id}`}
            className="h-9 px-5 shrink-0 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-white/20 flex items-center justify-center"
          >
            Book
          </Link>
          <button
            type="button"
            onClick={handleLike}
            className="flex items-center gap-1 text-[12px] font-medium"
            aria-pressed={liked}
          >
            <Heart size={16} className={liked ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} /> {likeCount}
          </button>
          <span className="flex items-center gap-1 text-[12px] font-medium text-white/70">
            <Eye size={14} /> {viewCount}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Showroom() {
  const [hats, setHats] = useState([])
  const [search, setSearch] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  // Id of the hat currently open in the YouTube-style popup (ShowroomVideoModal),
  // or null when the popup is closed. Kept separate from `activeIndex` — the
  // popup can flip through several hats via its own "more videos" rail
  // without touching which reel slide is snapped into view underneath.
  const [expandedId, setExpandedId] = useState(null)
  // Shared mute preference across all slides — defaults to unmuted so
  // videos play with their original audio; the ReelSlide autoplay effect
  // falls back to muted (and flips this) only if the browser blocks
  // autoplay with sound.
  const [muted, setMuted] = useState(false)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [headerOffset, setHeaderOffset] = useState(0)
  // Height of Showroom's own fixed filter bar — measured at runtime so a
  // spacer of the same height can reserve its space in normal flow
  // (the bar itself is `position: fixed` and so takes up no flow space).
  const [filterBarHeight, setFilterBarHeight] = useState(0)

  // Patches a single hat in place — used so a like/view recorded inside
  // ShowroomVideoModal (see its `onHatChange`) is reflected the moment the
  // popup closes, without refetching. Same pattern as Feed.jsx's
  // handleHatChange for BentoCardDetailModal.
  function handleHatChange(patch) {
    setHats((prev) => prev.map((h) => (h.id === patch.id ? { ...h, ...patch } : h)))
  }

  // Closing the popup snaps the reel behind it to whichever hat was last
  // shown there — so if the popup's own "more videos" rail was used to
  // browse elsewhere, the reel picks up where the popup left off instead
  // of silently staying on whatever slide was active before it opened.
  function closeExpanded() {
    const id = expandedId
    setExpandedId(null)
    if (!id) return
    const idx = filtered.findIndex((h) => h.id === id)
    if (idx === -1) return
    setActiveIndex(idx)
    containerRef.current
      ?.querySelector(`[data-hat-id="${id}"]`)
      ?.scrollIntoView({ block: 'start' })
  }

  async function loadShowroom() {
    try {
      const data = await api.getShowroom()
      setHats(data.hats || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Guarded separately from loadShowroom() above: React.StrictMode (see
  // main.jsx) double-invokes mount effects in dev, firing two overlapping
  // requests. Without this guard, whichever one resolves last wins — even
  // if it's the stale one — which is what caused the showroom to flash
  // in with data then go blank. `cancelled` ensures only the response
  // belonging to the current mount is ever applied.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getShowroom()
        if (!cancelled) setHats(data.hats || [])
      } catch (e) {
        if (!cancelled) console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the fixed filter bar pinned just below the app's own sticky
  // header instead of overlapping it — measured at runtime so it stays
  // correct across breakpoints without hardcoding pixel values.
  useEffect(() => {
    const measure = () => {
      const appHeader = document.querySelector('header')
      setHeaderOffset(appHeader ? appHeader.getBoundingClientRect().height : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Measure the filter bar's own height so the spacer below it can reserve
  // exactly that much room. Uses ResizeObserver (in addition to a resize
  // listener) so it stays correct if the row wraps to two lines on very
  // narrow screens or the search field grows/shrinks at a breakpoint.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setFilterBarHeight(el.getBoundingClientRect().height)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [headerOffset])

  const filtered = hats.filter((h) => {
    if (availableOnly && !h.availability) return false
    if (search) {
      const q = search.toLowerCase()
      const match =
        (h.username || '').toLowerCase().includes(q) ||
        (h.hat_title || '').toLowerCase().includes(q) ||
        (h.skills || []).some((s) => s.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  // Filters/search reshuffle which slide is "first" — snap back to it.
  useEffect(() => {
    setActiveIndex(0)
    containerRef.current?.scrollTo({ top: 0 })
  }, [search, availableOnly])

  // One observer watching every slide at once decides which single index
  // is "active" (i.e. snapped fully into view) — that's what drives which
  // video plays and which slide counts as viewed.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const slides = Array.from(container.querySelectorAll('[data-hat-id]'))
    if (!slides.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (!visible.length) return
        const top = visible.reduce((a, b) => (b.intersectionRatio > a.intersectionRatio ? b : a))
        const idx = slides.indexOf(top.target)
        if (idx !== -1) setActiveIndex(idx)
      },
      { root: container, threshold: [0.6] },
    )
    slides.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [hats, search, availableOnly])

  return (
    <div className="space-y-5 relative">
      <div
        ref={headerRef}
        style={{ top: headerOffset }}
        className="sticky z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-[#F7F3EB]/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
      >
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Showroom</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">
            Curated top talents · sorted by bookings + orbit score + likes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              type="search"
              placeholder="Search name / skill…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-10 rounded-full border-[1.5px] border-black bg-white text-[13px] font-medium outline-none focus:ring-4 focus:ring-black/[0.04]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="rounded border-black"
            />
            Available only
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-black/40 py-16 text-center text-[13px] font-medium">Loading showroom…</p>
      ) : filtered.length === 0 ? (
        <p className="text-black/40 py-16 text-center text-[13px] font-medium">No talents match your filters.</p>
      ) : (
        <div className="reel-container" ref={containerRef}>
          {filtered.map((h, i) => (
            <ReelSlide
              key={h.id}
              hat={h}
              active={i === activeIndex && !expandedId}
              muted={muted}
              onSetMuted={setMuted}
              onExpand={setExpandedId}
            />
          ))}
        </div>
      )}

      {/* Fixed circular "Add Spotlight" action — stays reachable while
          scrolling, tucked above the mobile bottom nav on small screens
          and pinned to the corner on desktop. */}
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        aria-label="Add Spotlight"
        title="Add Spotlight"
        className="fixed z-40 bottom-28 right-4 md:bottom-8 md:right-8 w-14 h-14 rounded-full bg-[#0A13E6] text-white flex items-center justify-center border-[1.5px] border-black shadow-[0_10px_30px_rgba(10,19,230,0.35)] hover:bg-black transition active:scale-95"
      >
        <Plus size={22} />
      </button>

      <AddShowroomMedia open={showAdd} onClose={() => setShowAdd(false)} onAdded={loadShowroom} />

      {expandedId && (
        <ShowroomVideoModal
          hats={filtered}
          activeId={expandedId}
          onSelect={setExpandedId}
          onClose={closeExpanded}
          muted={muted}
          onSetMuted={setMuted}
          onHatChange={handleHatChange}
        />
      )}
    </div>
  )
}