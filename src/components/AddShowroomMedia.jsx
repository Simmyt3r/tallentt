import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, uploadToCloudinary, uploadGalleryMedia, validateUploadFile } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { compressImageFile } from '../lib/media'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'
import Dialog from './hatform/Dialog.jsx'

const MAX_CAPTION = 200

// Step 1: pick which of your (talent) Hats this media belongs to.
// Step 2: pick + upload the photo/video.
// Step 3: caption it, then post — appends the new item to the front of
// that hat's media so it becomes the one shown in the reel.
export default function AddShowroomMedia({ open, onClose, onAdded }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [myHats, setMyHats] = useState([])
  const [mediaLibrary, setMediaLibrary] = useState([])
  const [recentPosts, setRecentPosts] = useState([])
  const [loadingHats, setLoadingHats] = useState(false)
  const [selectedHat, setSelectedHat] = useState(null)
  const [standalone, setStandalone] = useState(false)
  const [pendingMedia, setPendingMedia] = useState(null) // { url, public_id, type }
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const uploadControllerRef = useRef(null)

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

  useEffect(() => {
    if (!open || !user?.id) return undefined
    let canceled=false
    api.getMyGalleryPosts().then(data => {
      if(!canceled) setRecentPosts(data.posts||[])
    }).catch(() => { if(!canceled) setRecentPosts([]) })
    api.getMyMedia().then(data => {
      if(!canceled) setMediaLibrary((data.media || []).filter(item =>
        ['image','video'].includes(item.type) && ['legacy','passed'].includes(item.screening_status)))
    }).catch(() => {
      if(!canceled) setMediaLibrary([])
    })
    return () => { canceled=true }
  }, [open,user?.id])

  if (!open) return null

  function reset() {
    uploadControllerRef.current?.abort()
    uploadControllerRef.current = null
    setUploading(false)
    setSubmitting(false)
    setStep(1)
    setSelectedHat(null)
    setStandalone(false)
    setPendingMedia(null)
    setCaption('')
    setError('')
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose?.()
  }

  function pickHat(hat) {
    setStandalone(false)
    setSelectedHat(hat)
    setStep(2)
  }

  function pickStandalone() {
    setStandalone(true)
    setSelectedHat(null)
    setStep(2)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file || uploading) return
    e.target.value = ''
    const issue = validateUploadFile(file)
    if (issue) { setError(issue); return }
    const controller = new AbortController()
    uploadControllerRef.current = controller
    setUploading(true)
    setError('')
    try {
      const toUpload = await compressImageFile(file)
      if (controller.signal.aborted) return
      const uploaded = standalone ? await uploadGalleryMedia(toUpload) : await uploadToCloudinary(toUpload, { signal: controller.signal })
      if (controller.signal.aborted || uploadControllerRef.current !== controller) return
      setPendingMedia(uploaded)
      setStep(3)
    } catch (err) {
      if (err?.name !== 'AbortError' && !controller.signal.aborted &&
          uploadControllerRef.current === controller) setError(err.message || 'Upload failed. Please try again.')
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null
        setUploading(false)
      }
    }
  }

  async function handleSubmit() {
    if ((!selectedHat && !standalone) || !pendingMedia) return
    setSubmitting(true)
    setError('')
    try {
      let result
      if (standalone) {
        result = await api.publishGalleryPost(pendingMedia,caption.trim())
      } else {
        const nextMedia = [
          { ...pendingMedia, caption: caption.trim() || undefined },
          ...(selectedHat.media || []).filter(item => item.public_id !== pendingMedia.public_id),
        ]
        await api.updateHat(selectedHat.id, { media: nextMedia })
      }
      // Reposting to a previously hidden Hat restores its Showroom entry.
      try {
        if (!standalone) await api.restoreOwnShowroomPost(selectedHat.id)
      } catch (err) {
        // Older databases without this optional migration still permit
        // ordinary media updates; the API reports when restoration is absent.
        if (err?.status !== 503) throw err
      }
      onAdded?.(result)
      reset()
      onClose?.()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onClose={handleClose} labelledBy="showroom-add-title" maxWidth={440}>
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          aria-label="Close"
          className="modal-close absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-[#F5F3EF] border-[1.5px] border-black flex items-center justify-center hover:bg-black hover:text-white transition disabled:opacity-40"
        >
          <X size={16} />
        </button>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <p className="tw-label">Step {step} of 3</p>
            <h2 id="showroom-add-title" className="text-[18px] font-bold tracking-tight mt-0.5">
              {step === 1 && 'Choose how to post'}
              {step === 2 && 'Add media'}
              {step === 3 && 'Add a caption'}
            </h2>
          </div>

          {error && (
            <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: entertainment posts do not require commercial Hats. */}
          {step === 1 && (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              <button type="button" onClick={pickStandalone}
                className="w-full rounded-[16px] border-[1.5px] border-[#0A13E6]/40 bg-[#EEF0FF] p-4 text-left hover:border-[#0A13E6]">
                <strong className="block text-[13px]">Show your talent, just for fun</strong>
                <span className="mt-1 block text-[11px] text-black/60">
                  Upload a photo or video for entertainment. Your profile and View/Play appear, but there is no booking or application link.
                </span>
              </button>
              {recentPosts.length > 0 && (
                <section className="space-y-2 rounded-xl border border-black/10 bg-white p-3" aria-label="Your recent showcase posts">
                  <h3 className="text-[12px] font-bold">Your recent showcase posts</h3>
                  {recentPosts.slice(0,4).map(item=><div key={item.id} className="flex items-center gap-3 text-[11px]">
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/5">
                      <img src={item.media_type === 'video'
                        ? cldVideoPoster(item.media_url,{w:90,h:90})
                        : cldImage(item.media_url,{w:90,h:90})}
                        alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.caption||'Untitled showcase'}</span>
                      <span className="font-semibold text-black/50">{item.moderation_status === 'visible' ? 'Public' :
                        item.moderation_status === 'pending' ? 'Awaiting review' :
                        item.moderation_status === 'held' ? 'Needs admin review' : 'Not approved'}</span>
                    </span>
                    <button type="button" aria-label="Delete showcase post"
                      className="min-h-9 shrink-0 rounded-full border border-red-200 px-3 font-semibold text-red-700"
                      onClick={async()=>{
                        if(!window.confirm('Delete this showcase post?'))return
                        try {
                          await api.galleryAction('delete_gallery',item.id)
                          setRecentPosts(items=>items.filter(post=>post.id!==item.id))
                          onAdded?.({})
                        } catch(err){setError(err.message||'Unable to delete post.')}
                      }}>Delete</button>
                  </div>)}
                </section>
              )}
              <p className="text-[11px] font-black text-black/40 uppercase tracking-wide">Or promote a Talent Hat</p>
              {loadingHats ? (
                <p className="text-black/40 py-8 text-center text-[13px] font-medium">Loading your hats…</p>
              ) : myHats.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-black/60 text-[13px] font-medium">
                    Create a Talent Hat to receive bookings. Entertainment posts above do not need a Hat.
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
          {step === 2 && (selectedHat || standalone) && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-black/50 hover:text-black transition"
              >
                <ArrowLeft size={13} /> Change posting mode
              </button>
              <p className="text-[12px] text-black/50 font-medium">
                {standalone ? 'Entertainment showcase (no booking link)' : <>Posting to <span className="font-semibold text-black">{selectedHat.hat_title}</span></>}
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
                  {uploading ? 'Uploading…' : 'Choose a photo or video (up to 20 MB)'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={onFile}
                  disabled={uploading}
                />
              </label>
              {mediaLibrary.length > 0 && (
                <section className="space-y-2" aria-label="Choose from your media library">
                  <p className="text-[12px] font-bold">Or choose from your Media Library</p>
                  <p className="text-[11px] text-black/55">Approved media from your existing Hats. You do not need to upload it again.</p>
                  <div className="grid grid-cols-3 gap-2 max-h-[220px] overflow-y-auto">
                    {mediaLibrary.slice(0,24).map(item => (
                      <button key={item.public_id} type="button"
                        disabled={uploading} onClick={() => {setPendingMedia({
                          url:item.url, public_id:item.public_id, type:item.type,
                        });setCaption(item.caption || '');setStep(3)}}
                        aria-label={`Use archived media: ${item.caption || item.source_title || item.type}`}
                        className="relative aspect-square overflow-hidden rounded-xl border border-black/15 focus-visible:outline-2 focus-visible:outline-[#0A13E6]">
                        <img src={item.type === 'video' ? cldVideoPoster(item.url,{w:160,h:160}) :
                          cldImage(item.url,{w:160,h:160})} alt="" className="h-full w-full object-cover" />
                        {item.type === 'video' && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-1 text-[9px] font-bold text-white">Video</span>}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Step 3 — caption + post */}
          {step === 3 && (selectedHat || standalone) && pendingMedia && (
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
                  Caption ({caption.length}/{standalone ? 500 : MAX_CAPTION})
                </span>
                <textarea
                  className="tw-input min-h-[80px] resize-none"
                  maxLength={standalone ? 500 : MAX_CAPTION}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Say something about this…"
                />
              </label>
              <p className="text-[12px] text-black/60">Standalone videos require review before appearing publicly. Photos may be automatically screened. Hat posts use existing media moderation.</p>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="tw-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Check size={16} /> {submitting ? 'Posting…' : standalone ? 'Publish showcase' : 'Post to Showroom'}
              </button>
            </div>
          )}
        </div>
    </Dialog>
  )
}