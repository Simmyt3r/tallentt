// Path: src/components/profile/PortfolioViewerModal.jsx
import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cldImage, cldVideo } from '../../lib/cloudinary'

// Same scroll-lock / focus-restore / Escape-to-close pattern as
// BentoCardDetailModal.jsx — reused here rather than reinvented so the
// Portfolio viewer behaves identically to every other overlay in the
// app, and so closing it never leaves the Profile page scrolled
// somewhere else (the underlying page never actually scrolls while this
// is open — see PROFILE.md section 12).
export default function PortfolioViewerModal({ items, activeIndex, onClose, onNavigate }) {
  const closeButtonRef = useRef(null)

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
      if (e.key === 'ArrowLeft') onNavigate?.(-1)
      if (e.key === 'ArrowRight') onNavigate?.(1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNavigate])

  if (!items?.length) return null
  const item = items[activeIndex]
  const hasMultiple = items.length > 1

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || item.hat_title || 'Portfolio media'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal-panel !bg-black !border-black overflow-hidden">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close portfolio viewer"
          className="modal-close absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition"
        >
          <X size={18} />
        </button>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() => onNavigate?.(-1)}
              aria-label="Previous media"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black transition"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.(1)}
              aria-label="Next media"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black transition"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        <div className="w-full h-full min-h-[60vh] flex items-center justify-center bg-black">
          {item.type === 'video' ? (
            <video
              key={item.id || item.url}
              src={cldVideo(item.url, { w: 1080 })}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-[85dvh] object-contain"
            />
          ) : (
            <img
              key={item.id || item.url}
              src={cldImage(item.url, { w: 1600, crop: 'limit' })}
              alt={item.caption || item.hat_title || ''}
              className="max-w-full max-h-[85dvh] object-contain"
            />
          )}
        </div>

        {(item.caption || item.hat_title) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <p className="text-white text-[13px] font-medium leading-snug">{item.caption || item.hat_title}</p>
            {hasMultiple && (
              <p className="text-white/60 text-[11px] font-medium mt-0.5">
                {activeIndex + 1} / {items.length}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
