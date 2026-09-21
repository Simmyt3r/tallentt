import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Heart, Maximize2, Share2 } from 'lucide-react'
import AvailabilityBadge from './AvailabilityBadge'
import ShowroomMedia from './ShowroomMedia'
import { Avatar } from './bentoCardShared'

// True when a clamped paragraph is actually cut off, so "More" only shows
// when there is something more to read. Re-measured on resize because the
// same caption clamps differently at different widths.
function useIsClamped(ref, text) {
  const [clamped, setClamped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, text])
  return clamped
}

const actionBtn =
  'inline-flex items-center justify-center gap-1.5 h-11 min-w-[44px] px-2.5 sm:px-3 rounded-full text-[13px] font-semibold transition hover:bg-black/[0.06] active:scale-95'

// A single post. Its height is fixed by CSS (`.sr-post`) so the feed can be
// windowed with simple arithmetic; the media stage flexes to fill whatever the
// action row and identity block leave over.
//
// `playing` is decided by the parent (this post is the one in view, no dialog
// is open, the tab is visible) — the post never starts playback on its own.
function ShowroomPost({
  hat,
  postKey,
  playing,
  muted,
  onMutedChange,
  onLike,
  onShare,
  onView,
  observe,
}) {
  const rootRef = useRef(null)
  const captionRef = useRef(null)
  const media = hat.media?.[0]
  const caption = media?.caption || hat.motto || ''
  const isVideo = media?.type === 'video'
  const truncated = useIsClamped(captionRef, caption)
  const location = [hat.lga, hat.country].filter(Boolean).join(', ')
  const profilePath = `/talent/${hat.id}`

  // Register with the parent's shared IntersectionObserver so it can tell
  // which single post is in view.
  useEffect(() => {
    const el = rootRef.current
    return el ? observe(el) : undefined
  }, [observe])

  return (
    <article
      ref={rootRef}
      data-post-key={postKey}
      aria-label={`Showroom post by ${hat.username}`}
      className="sr-post flex flex-col overflow-hidden bg-white border-y md:border border-black/15 md:rounded-[20px] md:shadow-[0_6px_20px_-12px_rgba(0,0,0,0.25)]"
    >
      <div className="relative flex-1 min-h-0 bg-[#0b0b0b]">
        <ShowroomMedia
          media={media}
          alt={caption || `${hat.username}'s Showroom ${isVideo ? 'video' : 'post'}`}
          playing={playing}
          muted={muted}
          onMutedChange={onMutedChange}
          onOpen={() => onView(hat.id)}
        />
        {hat.isHost && (
          <span className="absolute top-3 left-3 z-10 bg-[#FFBD2E] text-black text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border-[1.5px] border-black shadow pointer-events-none">
            Showroom Host
          </span>
        )}
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <AvailabilityBadge available={hat.availability} />
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-0.5 px-2 sm:px-3 pt-1">
        <button
          type="button"
          onClick={() => onLike(hat.id)}
          aria-pressed={!!hat.liked_by_me}
          aria-label={`${hat.liked_by_me ? 'Unlike' : 'Like'}${hat.likes ? `, ${hat.likes} likes` : ''}`}
          className={actionBtn}
        >
          <Heart size={18} className={hat.liked_by_me ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} aria-hidden="true" />
          <span>{hat.likes > 0 ? hat.likes : 'Like'}</span>
        </button>
        <button
          type="button"
          onClick={() => onShare(hat)}
          aria-label={`Share post by ${hat.username}`}
          className={actionBtn}
        >
          <Share2 size={17} aria-hidden="true" />
          <span>Share</span>
        </button>
        <button
          type="button"
          onClick={() => onView(hat.id)}
          aria-label={`View post by ${hat.username}`}
          className={`${actionBtn} bg-[#0A13E6] text-white hover:bg-black`}
        >
          <Maximize2 size={15} aria-hidden="true" />
          <span>View</span>
        </button>
        <span
          className="ml-auto pr-1 inline-flex items-center gap-1 text-[12px] font-medium text-black/45 tabular-nums"
          title={`${hat.views || 0} views`}
        >
          <Eye size={14} aria-hidden="true" />
          {hat.views || 0}
        </span>
      </div>

      <div className="shrink-0 flex items-start gap-2.5 px-3 sm:px-4 pt-1.5 pb-3 min-w-0">
        <Link to={profilePath} aria-label={`${hat.username}'s profile`} className="shrink-0 rounded-full">
          <Avatar src={hat.owner_avatar} name={hat.username} className="w-10 h-10" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <Link to={profilePath} className="font-bold text-[14px] leading-tight truncate min-w-0 hover:underline">
              @{hat.username}
            </Link>
            {hat.is_verified && (
              <span className="text-[#0A13E6] text-[12px] shrink-0" title="Verified" aria-label="Verified">
                ✓
              </span>
            )}
            {location && <span className="text-[11px] text-black/45 truncate min-w-0 hidden sm:inline">· {location}</span>}
          </div>
          {caption && (
            <div className="flex items-end gap-1.5 mt-0.5">
              <p
                ref={captionRef}
                className="text-[13px] leading-snug text-black/80 line-clamp-2 break-words min-w-0"
              >
                {caption}
              </p>
              {truncated && (
                <button
                  type="button"
                  onClick={() => onView(hat.id)}
                  aria-label={`Read the full caption by ${hat.username}`}
                  className="shrink-0 text-[13px] font-semibold text-black/55 hover:text-black leading-snug"
                >
                  More
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default memo(ShowroomPost)
