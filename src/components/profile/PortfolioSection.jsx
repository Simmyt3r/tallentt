// Path: src/components/profile/PortfolioSection.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageIcon, Play } from 'lucide-react'
import { cldImage, cldVideoPoster } from '../../lib/cloudinary'
import PortfolioViewerModal from './PortfolioViewerModal.jsx'

export default function PortfolioSection({ items, isOwner }) {
  const [activeIndex, setActiveIndex] = useState(null)

  // Visitors see nothing when there's genuinely no portfolio yet — no
  // decorative empty box (see PROFILE.md section 33). Owners always see
  // the section so they have somewhere to find the "add portfolio" CTA.
  if (!items?.length && !isOwner) return null

  return (
    <section aria-labelledby="portfolio-heading" className="space-y-3">
      <h2 id="portfolio-heading" className="text-[15px] font-bold tracking-tight">
        Portfolio
      </h2>

      {items?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((item, i) => (
            <button
              key={item.id || `${item.url}-${i}`}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={item.caption || item.hat_title || `Portfolio media ${i + 1}`}
              className="relative aspect-square rounded-[14px] overflow-hidden border-[1.5px] border-black/10 bg-[#F5F3EF] group"
            >
              {item.type === 'video' ? (
                <>
                  <img
                    src={cldVideoPoster(item.url, { w: 320, h: 320 })}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition">
                    <Play size={22} className="text-white fill-white" />
                  </span>
                </>
              ) : (
                <img
                  src={cldImage(item.url, { w: 320, h: 320 })}
                  alt={item.caption || ''}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition"
                />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 px-5 bg-[#F5F3EF] rounded-[20px] border-[1.5px] border-dashed border-black/15 space-y-2.5">
          <ImageIcon size={22} className="mx-auto text-black/30" />
          <p className="text-[13px] font-semibold">Show your work</p>
          <p className="text-[12px] text-black/50 max-w-[320px] mx-auto">
            Add portfolio media to help clients understand what you can do.
          </p>
          <Link to="/create" className="tw-btn-primary inline-flex h-9 px-4 text-[12px] mt-1">
            Add Portfolio
          </Link>
        </div>
      )}

      {isOwner && items?.length > 0 && (
        <p className="text-[11px] text-black/40 font-medium">
          Portfolio media comes from your active Talent hats. Manage it from{' '}
          <Link to="/my-hats" className="underline underline-offset-2 hover:text-black">
            My Hats
          </Link>
          .
        </p>
      )}

      {activeIndex != null && (
        <PortfolioViewerModal
          items={items}
          activeIndex={activeIndex}
          onClose={() => setActiveIndex(null)}
          onNavigate={(delta) =>
            setActiveIndex((i) => (i + delta + items.length) % items.length)
          }
        />
      )}
    </section>
  )
}