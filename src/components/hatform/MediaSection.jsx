// Path: src/components/hatform/MediaSection.jsx
import { memo, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Music, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { cldImage, cldVideo, cldVideoPoster } from '../../lib/cloudinary'
import Dialog from './Dialog'
import { Section } from './formParts'
import { KIND_LABEL } from './useHatMedia'

const iconBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] flex-1 rounded-full border-[1.5px] border-black/15 bg-white text-[12px] font-semibold text-black/70 transition hover:border-black hover:text-black disabled:opacity-35 disabled:hover:border-black/15 disabled:hover:text-black/70'

function itemLabel(item, index) {
  return `${KIND_LABEL[item.kind] || 'Media'} ${index + 1}`
}

function Thumb({ item }) {
  const [broken, setBroken] = useState(false)
  let src = ''
  if (item.kind === 'image') src = item.previewUrl || cldImage(item.url, { w: 360, h: 360 })
  else if (item.kind === 'video' && item.url) src = cldVideoPoster(item.url, { w: 360, h: 360 })
  useEffect(() => setBroken(false), [src])

  if (item.kind === 'video' && !item.url && item.previewUrl) {
    // Still uploading: show the first frame straight from the local file.
    return <video src={`${item.previewUrl}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" className="w-full h-full object-cover pointer-events-none" />
  }
  if (src && !broken) {
    return (
      <span className="relative block w-full h-full">
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
        {item.kind === 'video' && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center">
              <Play size={16} />
            </span>
          </span>
        )}
      </span>
    )
  }
  const Icon = item.kind === 'video' ? Play : Music
  return (
    <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-black/45">
      <Icon size={22} aria-hidden="true" />
      <span className="text-[11px] font-semibold">{KIND_LABEL[item.kind] || 'Media'}</span>
    </span>
  )
}

const Tile = memo(function Tile({ item, index, total, onPreview, onMove, onRemove, onRetry }) {
  const label = itemLabel(item, index)
  const pending = item.status === 'queued' || item.status === 'uploading'
  const failed = item.status === 'failed'
  const percent = Math.round((item.progress || 0) * 100)
  const processing = item.status === 'uploading' && item.progress >= 1

  return (
    <li className="min-w-0 space-y-1.5">
      <div
        className={`relative overflow-hidden rounded-[14px] border-[1.5px] bg-[#F5F3EF] ${
          failed ? 'border-red-400' : index === 0 ? 'border-[#0A13E6] ring-2 ring-[#0A13E6]/25' : 'border-black/15'
        }`}
      >
        <button type="button" onClick={() => onPreview(item.key)} aria-label={`Preview ${label}${item.name ? `, ${item.name}` : ''}`} className="block w-full aspect-square">
          <Thumb item={item} />
        </button>

        {index === 0 && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-[#0A13E6] px-2 py-0.5 text-[11px] font-bold text-white border border-black">Cover</span>
        )}

        {pending && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1.5 text-white">
            <div
              role="progressbar"
              aria-label={`Uploading ${label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.status === 'queued' ? 0 : percent}
              aria-valuetext={item.status === 'queued' ? 'Waiting' : processing ? 'Processing' : `${percent}%`}
              className="h-1.5 rounded-full bg-white/30 overflow-hidden"
            >
              <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${item.status === 'queued' ? 0 : percent}%` }} />
            </div>
            <p className="mt-1 text-[11px] font-semibold tabular-nums">{item.status === 'queued' ? 'Waiting…' : processing ? 'Processing…' : `Uploading ${percent}%`}</p>
          </div>
        )}
      </div>

      {failed && (
        <p className="text-[12px] font-semibold text-red-600 leading-snug break-words" id={`${item.key}-err`}>
          {item.error}
        </p>
      )}

      <div className="flex gap-1.5">
        {item.status === 'ready' && (
          <>
            <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onMove(item.key, -1)} aria-label={`Move ${label} earlier`}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className={iconBtn} disabled={index === total - 1} onClick={() => onMove(item.key, 1)} aria-label={`Move ${label} later`}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className={`${iconBtn} hover:!border-red-500 hover:!text-red-600`} onClick={() => onRemove(item.key)} aria-label={`Remove ${label}`}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </>
        )}
        {pending && (
          <button type="button" className={iconBtn} onClick={() => onRemove(item.key)} aria-label={`Cancel upload of ${label}`}>
            <X size={15} aria-hidden="true" /> Cancel
          </button>
        )}
        {failed && (
          <>
            <button type="button" className={iconBtn} onClick={() => onRetry(item.key)} aria-label={`Retry upload of ${label}`} aria-describedby={`${item.key}-err`}>
              <RotateCcw size={14} aria-hidden="true" /> Retry
            </button>
            <button type="button" className={`${iconBtn} hover:!border-red-500 hover:!text-red-600`} onClick={() => onRemove(item.key)} aria-label={`Remove ${label}`}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  )
})

function MediaViewer({ item, index, onClose, onMakeCover }) {
  const closeRef = useRef(null)
  if (!item) return null
  const label = itemLabel(item, index)
  const local = item.previewUrl
  let body
  if (item.kind === 'image') {
    body = <img src={local || cldImage(item.url, { w: 1400, h: 1400, crop: 'limit' })} alt={label} className="max-h-[70dvh] w-full object-contain" />
  } else if (item.kind === 'video') {
    body = <video controls playsInline src={local || cldVideo(item.url, { w: 960 })} className="max-h-[70dvh] w-full" />
  } else if (item.url) {
    body = <audio controls src={item.url} className="w-full max-w-[420px]" />
  } else {
    body = <p className="text-[13px] font-medium text-white/80">Audio preview is available once the upload finishes.</p>
  }
  return (
    <Dialog open onClose={onClose} labelledBy="hat-media-viewer-title" maxWidth={720} initialFocusRef={closeRef}>
      <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-black px-4 py-3">
        <h2 id="hat-media-viewer-title" className="text-[15px] font-bold truncate">
          {label}
          {index === 0 && <span className="ml-2 text-[12px] font-bold text-[#0A13E6]">Cover</span>}
        </h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" className="w-10 h-10 shrink-0 rounded-full border-[1.5px] border-black flex items-center justify-center">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="bg-black flex items-center justify-center min-h-[200px] p-2">{body}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        {index > 0 && item.status === 'ready' && (
          <button
            type="button"
            className="tw-btn-ghost h-11 px-5 text-[13px]"
            onClick={() => {
              onMakeCover(item.key)
              onClose()
            }}
          >
            Make cover
          </button>
        )}
        <button type="button" className="tw-btn-primary h-11 px-6 text-[13px]" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  )
}

function MediaSection({ items, error, copy, rejected, announcement, onAddFiles, onRetry, onRemove, onMove, onMakeCover, onDismissRejected }) {
  const inputRef = useRef(null)
  const [viewKey, setViewKey] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [note, setNote] = useState('')
  // One live region for both upload results and reorder feedback; latest wins.
  useEffect(() => {
    if (announcement) setNote(announcement)
  }, [announcement])

  const viewIndex = items.findIndex((it) => it.key === viewKey)
  const viewItem = viewIndex >= 0 ? items[viewIndex] : null

  function handleMove(key, delta) {
    const from = items.findIndex((it) => it.key === key)
    const to = from + delta
    if (from < 0 || to < 0 || to >= items.length) return
    setNote(`${itemLabel(items[from], from)} moved to position ${to + 1} of ${items.length}${to === 0 ? ', now the cover' : ''}.`)
    onMove(key, delta)
  }

  return (
    <Section id="hat-section-media" title={copy.mediaRequired ? "Media * Required" : "Media · Optional"}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onAddFiles(e.dataTransfer.files)
        }}
        className="space-y-3"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          hidden
          aria-label="Add photos, video or audio"
          onChange={(e) => {
            onAddFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          id="hat-media-add"
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby={error ? 'hat-media-error' : undefined}
          aria-invalid={error ? true : undefined}
          className={`w-full min-h-[64px] rounded-[16px] border-[1.5px] border-dashed px-4 py-3 flex items-center justify-center gap-2 text-[14px] font-semibold transition ${
            error ? 'border-red-400 bg-red-50/40 text-red-700' : dragging ? 'border-[#0A13E6] bg-[#0A13E6]/5 text-[#0A13E6]' : 'border-black/25 bg-[#F5F3EF]/60 text-black/75 hover:border-black'
          }`}
        >
          <Plus size={18} aria-hidden="true" /> Add photos, video or audio
        </button>
        {error && (
          <p id="hat-media-error" className="text-[12px] font-semibold text-red-600">
            {error}
          </p>
        )}

        {rejected.length > 0 && (
          <ul role="alert" className="space-y-1.5">
            {rejected.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                <span className="min-w-0 flex-1 break-words">
                  <strong className="font-bold">{r.name}</strong> was not added. {r.reason}
                </span>
                <button type="button" onClick={() => onDismissRejected(r.id)} aria-label={`Dismiss message about ${r.name}`} className="shrink-0 w-8 h-8 -m-1 flex items-center justify-center rounded-full hover:bg-red-100">
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" aria-label="Media">
              {items.map((it, i) => (
                <Tile key={it.key} item={it} index={i} total={items.length} onPreview={setViewKey} onMove={handleMove} onRemove={onRemove} onRetry={onRetry} />
              ))}
            </ul>
          </>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {note}
        </p>
      </div>

      <MediaViewer item={viewItem} index={viewIndex} onClose={() => setViewKey(null)} onMakeCover={onMakeCover} />
    </Section>
  )
}

export default memo(MediaSection)
