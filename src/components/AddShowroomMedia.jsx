import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, uploadToCloudinary } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { compressImageFile } from '../lib/media'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'

const MAX_CAPTION = 200

// Step 1: pick which of your (talent) Hats this media belongs to.
// Step 2: pick + upload the photo/video.
// Step 3: caption it, then post — appends the new item to the front of
// that hat's media so it becomes the one shown in the reel.
export default function AddShowroomMedia({ open, onClose, onAdded }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [myHats, setMyHats] = useState([])
  const [loadingHats, setLoadingHats] = useState(false)
  const [selectedHat, setSelectedHat] = useState(null)
  const [pendingMedia, setPendingMedia] = useState(null) // { url, public_id, type }
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !user?.id) return
    let cancelled = false
    setLoadingHats(true)
    setError('')
    ;(async () => {
      try {
        const data = await api.getHats({ user_id: user.id, role: 'talent' })
        if (!cancelled) setMyHats(data.hats || [])
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoadingHats(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, user?.id])

  if (!open) return null

  function reset() {
    setStep(1)
    setSelectedHat(null)
    setPendingMedia(null)
    setCaption('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose?.()
  }

  function pickHat(hat) {
    setSelectedHat(hat)
    setStep(2)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const toUpload = await compressImageFile(file)
      const uploaded = await uploadToCloudinary(toUpload)
      setPendingMedia(uploaded)
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSubmit() {
    if (!selectedHat || !pendingMedia) return
    setSubmitting(true)
    setError('')
    try {
      const nextMedia = [
        { ...pendingMedia, caption: caption.trim() || undefined },
        ...(selectedHat.media || []),
      ]
      await api.updateHat(selectedHat.id, { media: nextMedia })
      onAdded?.()
      handleClose()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="modal-panel !max-w-[440px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-[#F5F3EF] border-[1.5px] border-black flex items-center justify-center hover:bg-black hover:text-white transition"
          onClick={handleClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <p className="tw-label">Step {step} of 3</p>
            <h2 className="text-[18px] font-bold tracking-tight mt-0.5">
              {step === 1 && 'Pick a card'}
              {step === 2 && 'Add media'}
              {step === 3 && 'Add a caption'}
            </h2>
          </div>

          {error && (
            <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Step 1 — choose which Hat/card to post this media to */}
          {step === 1 && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {loadingHats ? (
                <p className="text-black/40 py-8 text-center text-[13px] font-medium">Loading your hats…</p>
              ) : myHats.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-black/50 text-[13px] font-medium">
                    You need a Talent hat before you can post to the Showroom.
                  </p>
                  <Link
                    to="/create"
                    onClick={handleClose}
                    className="tw-btn-primary inline-flex h-10 px-5 text-[13px]"
                  >
                    Create a Hat
                  </Link>
                </div>
              ) : (
                myHats.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => pickHat(h)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-[14px] border-[1.5px] border-black/10 hover:border-black transition text-left"
                  >
                    <div className="w-12 h-12 rounded-[10px] bg-[#F5F3EF] overflow-hidden shrink-0 border border-black/10">
                      {h.media?.[0]?.url &&
                        (h.media[0].type === 'video' ? (
                          <img src={cldVideoPoster(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <img src={cldImage(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                        ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[13px] truncate">{h.hat_title}</p>
                      <p className="text-[11px] text-black/50 truncate">{h.category}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 2 — pick + upload the media file */}
          {step === 2 && selectedHat && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-black/50 hover:text-black transition"
              >
                <ArrowLeft size={13} /> Change card
              </button>
              <p className="text-[12px] text-black/50 font-medium">
                Posting to <span className="font-semibold text-black">{selectedHat.hat_title}</span>
              </p>
              <label
                className={`flex flex-col items-center gap-2 cursor-pointer py-8 rounded-[16px] border-[1.5px] border-dashed transition ${
                  uploading ? 'border-black/10 bg-[#F5F3EF]/50' : 'border-black/15 bg-[#F5F3EF]/50 hover:border-black/30'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white border-[1.5px] border-black flex items-center justify-center">
                  <Upload size={18} />
                </div>
                <span className="text-[12px] font-semibold text-black/70">
                  {uploading ? 'Uploading…' : 'Choose a photo or video'}
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={onFile}
                  disabled={uploading}
                />
              </label>
            </div>
          )}

          {/* Step 3 — caption + post */}
          {step === 3 && selectedHat && pendingMedia && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-black/50 hover:text-black transition"
              >
                <ArrowLeft size={13} /> Change media
              </button>
              <div className="w-full aspect-[4/3] rounded-[14px] overflow-hidden bg-[#F5F3EF] border-[1.5px] border-black/10">
                {pendingMedia.type === 'video' ? (
                  <video src={cldVideo(pendingMedia.url, { w: 640 })} className="w-full h-full object-cover" muted controls />
                ) : (
                  <img src={cldImage(pendingMedia.url, { w: 640, h: 480 })} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <label className="block space-y-1.5">
                <span className="tw-label">
                  Caption ({caption.length}/{MAX_CAPTION})
                </span>
                <textarea
                  className="tw-input min-h-[80px] resize-none"
                  maxLength={MAX_CAPTION}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Say something about this…"
                />
              </label>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="tw-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Check size={16} /> {submitting ? 'Posting…' : 'Post to Showroom'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}