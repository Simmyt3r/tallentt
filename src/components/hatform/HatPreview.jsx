// Path: src/components/hatform/HatPreview.jsx
import { useRef } from 'react'
import { Clock, MapPin, Music, X } from 'lucide-react'
import UserIdentity from '../UserIdentity'
import { cldImage, cldVideoPoster } from '../../lib/cloudinary'
import Dialog from './Dialog'

function Cover({ item }) {
  if (!item) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[12px] font-medium text-black/35">
        No media yet. The first item you add becomes the cover.
      </div>
    )
  }
  if (item.kind === 'image') {
    return <img src={item.previewUrl || cldImage(item.url, { w: 800, h: 600 })} alt="" className="w-full h-full object-cover" />
  }
  if (item.kind === 'video') {
    if (item.url) return <img src={cldVideoPoster(item.url, { w: 800, h: 600 })} alt="" className="w-full h-full object-cover" />
    if (item.previewUrl) return <video src={`${item.previewUrl}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-black/40">
      <Music size={26} aria-hidden="true" />
      <span className="text-[12px] font-semibold">Audio cover</span>
    </div>
  )
}

const muted = 'text-black/35 font-medium'

// Read-only picture of how the Hat will look to someone browsing. Purely
// presentational: no API calls, nothing is created or published from here.
export default function HatPreview({ open, onClose, preview, cover, owner }) {
  const closeRef = useRef(null)
  const pillBg = preview.role === 'talent' ? 'bg-[#0A13E6]' : 'bg-black'
  const uploadingCover = cover && cover.status !== 'ready'

  return (
    <Dialog open={open} onClose={onClose} labelledBy="hat-preview-title" describedBy="hat-preview-note" maxWidth={480} initialFocusRef={closeRef}>
      <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-black px-4 py-3">
        <h2 id="hat-preview-title" className="text-[16px] font-bold">
          Preview
        </h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" className="w-10 h-10 shrink-0 rounded-full border-[1.5px] border-black flex items-center justify-center">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p id="hat-preview-note" className="text-[12px] font-medium text-black/55">
          This is roughly how your Hat will look to others. Nothing is published from here.
        </p>

        <article className="overflow-hidden rounded-[20px] border-[1.5px] border-black bg-white shadow-sm">
          <div className="relative aspect-[4/3] bg-[#F5F3EF]">
            <Cover item={cover} />
            <span className={`absolute top-2.5 left-2.5 ${pillBg} text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full border-[1.5px] border-black`}>{preview.hatType}</span>
            {preview.available && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[#16C784] border-[1.5px] border-white" title={preview.openLabel} />}
            {uploadingCover && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">Still uploading</span>}
          </div>

          <div className="p-3.5 space-y-2.5">
            <UserIdentity
              user={owner}
              avatarClassName="w-11 h-11"
              nameClassName="font-semibold text-[14px] leading-tight"
              nameBadge={
                preview.verified ? (
                  <span className="ml-1 text-[#0A13E6] text-[12px]" title="Verified">
                    ✓
                  </span>
                ) : null
              }
            >
              <p className="text-[12px] font-semibold text-black/75">{preview.listingLabel}</p>
            </UserIdentity>

            <h3 className={`text-[18px] font-bold leading-snug break-words ${preview.title ? '' : muted}`}>{preview.title || 'Your title'}</h3>

            <div className="flex items-center gap-2 text-[11.5px] text-black/60 font-medium flex-wrap">
              {preview.category ? <span className="px-2 py-0.5 rounded-full bg-[#F5F3EF] border border-black/10">{preview.category}</span> : <span className={muted}>Category</span>}
              {preview.delivery && <span className="px-2 py-0.5 rounded-full bg-[#F5F3EF] border border-black/10">{preview.delivery}</span>}
            </div>

            <div className="space-y-1 text-[12.5px] font-medium text-black/65">
              <p className="flex items-center gap-1.5">
                <MapPin size={13} aria-hidden="true" className="shrink-0" />
                <span className="break-words min-w-0">{preview.location || <span className={muted}>Location</span>}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Clock size={13} aria-hidden="true" className="shrink-0" />
                <span className="break-words min-w-0">
                  {preview.available ? preview.openLabel : 'Not available right now'}
                  {preview.hours ? ` · ${preview.hours}` : ''}
                </span>
              </p>
            </div>

            <p className={`text-[16px] font-bold ${preview.price ? '' : muted}`}>{preview.price || `Add a ${preview.priceNoun}`}</p>

            {preview.description && <p className="text-[13px] leading-snug text-black/75 break-words">{preview.description}</p>}
            {preview.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                {preview.skills.map((s) => (
                  <li key={s} className="px-2 py-0.5 rounded-full border border-black/10 bg-[#F5F3EF] text-[11.5px] font-medium">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </div>

      <div className="border-t-[1.5px] border-black/10 px-4 py-3 flex justify-end">
        <button type="button" onClick={onClose} className="tw-btn-primary h-11 px-6 text-[13px]">
          Keep editing
        </button>
      </div>
    </Dialog>
  )
}
