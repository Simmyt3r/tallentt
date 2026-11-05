import { useEffect, useRef, useState } from 'react'
import { ImageOff, Music } from 'lucide-react'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'

// True fit: display the whole photo/video at its natural aspect ratio inside
// the available Showroom stage. Never crop, stretch or duplicate the media.
// Unused space is a neutral surface instead of black bars or a blurred copy.
// Videos keep native controls (play/pause, seek, volume, fullscreen). The app decides
// *when* a video should be playing via `playing`, and mirrors the mute
// preference across posts.
//
// Keyed on the media URL so a different item always starts from a clean
// loading state (and a clean <video>) rather than inheriting the last one's.
export default function ShowroomMedia(props) {
  return <MediaInner key={props.media?.url || 'none'} {...props} />
}

function MediaInner({
  media,
  alt = '',
  playing = false,
  muted = false,
  onMutedChange,
  onOpen,
  onDimensions,
  width = 1080,
}) {
  const url = media?.url
  const isVideo = media?.type === 'video' && !!url
  const isAudio = media?.type === 'audio' && !!url
  const isImage = !!url && !isVideo && !isAudio
  // Cloudinary's 'limit' transformation preserves the original aspect ratio.
  const imageSrc = isImage ? cldImage(url, { w: width, crop: 'limit' }) : ''
  const videoPoster = isVideo ? cldVideoPoster(url, { w: width, crop: 'limit' }) : ''

  const elRef = useRef(null)
  const [status, setStatus] = useState(url ? 'loading' : 'empty') // loading | ready | error | empty

  // Latest values for effects/handlers that must not re-run on every change.
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onMutedChangeRef = useRef(onMutedChange)
  onMutedChangeRef.current = onMutedChange

  // Manual playback only. The first video frame/poster may load, but
  // neither scrolling to a post nor opening its detail may start playback.
  // Scrolling away or opening a different post still pauses any user-played video.
  useEffect(()=>{
    if(!playing) elRef.current?.pause()
  },[playing])

  // Mute preference changed elsewhere (e.g. on another post).
  useEffect(() => {
    const el = elRef.current
    if (el && el.muted !== muted) el.muted = muted
  }, [muted])

  // Release the network connection and decoder when this item goes away
  // (scrolled far off, modal closed, another related post picked).
  // The pause is immediate (a detached <video> would otherwise keep playing
  // audio); the source is only dropped once the element is really gone. In
  // dev, React.StrictMode runs this cleanup against a still-mounted element
  // and re-runs the effect straight after — dropping the source then would
  // leave a live player blank.
  useEffect(() => {
    const el = elRef.current
    return () => {
      if (!el || !(isVideo || isAudio)) return
      el.pause()
      setTimeout(() => {
        if (el.isConnected) return
        el.removeAttribute('src')
        el.load()
      }, 0)
    }
  }, [isVideo, isAudio])

  const handleVolumeChange = (e) => {
    const m = e.currentTarget.muted
    if (m !== mutedRef.current) onMutedChangeRef.current?.(m)
  }

  return (
    <div className={`absolute inset-0 overflow-hidden ${isAudio ? 'bg-[#0b0b0b]' : 'bg-[#F7F3EB]'}`}>
      {status === 'loading' && <div className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-hidden="true" />}

      {isVideo && (
        <video
          ref={elRef}
          src={cldVideo(url, { w: width })}
          poster={videoPoster}
          aria-label={alt || 'Video'}
          className="absolute inset-0 w-full h-full object-contain object-center bg-[#F7F3EB]"
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            setStatus('ready')
            onDimensions?.({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
          }}
          onError={() => setStatus('error')}
          onVolumeChange={handleVolumeChange}
        />
      )}

      {isImage && (
        <img
          src={imageSrc}
          alt={alt}
          decoding="async"
          draggable={false}
          onClick={onOpen}
          className={`absolute inset-0 w-full h-full object-contain object-center ${onOpen ? 'cursor-zoom-in' : ''}`}
          onLoad={(e) => {
            setStatus('ready')
            onDimensions?.({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }}
          onError={() => setStatus('error')}
        />
      )}

      {isAudio && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
          <Music size={40} className="text-white/40" aria-hidden="true" />
          <audio
            ref={elRef}
            src={cldVideo(url)}
            controls
            preload="metadata"
            aria-label={alt || 'Audio'}
            className="w-full max-w-sm"
            onLoadedMetadata={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
        </div>
      )}

      {status === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center text-black/45 text-[13px] font-medium">
          No media
        </div>
      )}

      {status === 'error' && (
        <div
          role="img"
          aria-label="Media unavailable"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50 text-[13px] font-medium bg-[#0b0b0b]"
        >
          <ImageOff size={28} aria-hidden="true" />
          Media unavailable
        </div>
      )}
    </div>
  )
}
