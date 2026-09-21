// Path: src/pages/TalentProfile.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Clock, Eye, Heart, MapPin, Send, Star } from 'lucide-react'
import { api } from '../lib/api'
import AvailabilityBadge from '../components/AvailabilityBadge'
import UserIdentity from '../components/UserIdentity'
import { identityFromHat } from '../lib/profile.js'
import { cldImage, cldVideo, cldVideoPoster } from '../lib/cloudinary'

const fmtMoney = (n, currency = 'NGN') => {
  if (n == null) return null
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

// Mirrors the pricing display logic in BentoCard.jsx / api/_lib/hatFields.js.
function formatPrice(hat, currency) {
  if (hat.price_type === 'range' && hat.price_min != null) {
    const min = fmtMoney(hat.price_min, currency)
    const max = fmtMoney(hat.price_max, currency)
    const base = max && hat.price_max !== hat.price_min ? `${min} – ${max}` : min
    return hat.price_negotiable ? `${base} · negotiable` : base
  }
  if (hat.rate != null) {
    const unit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit ? `/${hat.rate_unit}` : ''
    return `${fmtMoney(hat.rate, currency)}${unit ? ` ${unit}` : ''}`
  }
  return '—'
}

function formatTime(t) {
  if (!t) return ''
  const [hStr, mStr] = String(t).split(':')
  let h = Number(hStr)
  const m = Number(mStr || 0)
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`
}

function formatAvailabilityWindow(hat) {
  if (!hat.available_from && !hat.available_to) return ''
  if (hat.available_from && hat.available_to) return `${formatTime(hat.available_from)} – ${formatTime(hat.available_to)}`
  return formatTime(hat.available_from || hat.available_to)
}

// Reached from the Showroom's "Book Now" — shows the full card/profile for
// one hat, with the actual booking (escrow) action.
export default function TalentProfile() {
  const { hatId } = useParams()
  const navigate = useNavigate()
  const [hat, setHat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeMedia, setActiveMedia] = useState(0)
  const [booking, setBooking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [appliedStatus, setAppliedStatus] = useState(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [liking, setLiking] = useState(false)
  const [viewCount, setViewCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const data = await api.getHat(hatId)
        if (!cancelled) {
          setHat(data.hat)
          setActiveMedia(0)
          setAppliedStatus(data.hat.my_application?.status || null)
          setLiked(!!data.hat.liked_by_me)
          setLikeCount(data.hat.likes || 0)
          setViewCount((data.hat.views || 0) + 1)
          api.recordView(hatId).catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load this profile.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hatId])

  async function handleLike() {
    if (liking) return
    setLiking(true)
    const next = !liked
    setLiked(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    try {
      await api.toggleLike(hatId)
    } catch (e) {
      setLiked(!next)
      setLikeCount((c) => c + (next ? -1 : 1))
    } finally {
      setLiking(false)
    }
  }

  async function handleBook() {
    if (!hat) return
    setBooking(true)
    try {
      const { escrow } = await api.createEscrow({ hat_id: hat.id })
      navigate(`/messages?escrow=${escrow.id}`)
    } catch (e) {
      alert(e.message)
    } finally {
      setBooking(false)
    }
  }

  async function handleApply() {
    if (!hat) return
    setApplying(true)
    try {
      const { application, already_applied } = await api.applyToHat(hat.id)
      setAppliedStatus(application?.status || 'pending')
      alert(already_applied ? 'You already applied to this hat.' : 'Application sent!')
    } catch (e) {
      alert(e.message)
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading profile…</p>
  }

  if (error || !hat) {
    return (
      <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20 space-y-3">
        <p className="text-black/50 text-[13px] font-medium">{error || 'This profile could not be found.'}</p>
        <button type="button" onClick={() => navigate(-1)} className="tw-btn-ghost h-9 px-4 text-[12px] inline-flex mx-auto">
          Go back
        </button>
      </div>
    )
  }

  const media = hat.media || []
  const current = media[activeMedia]
  const currency = hat.currency || 'NGN'
  const location = [hat.lga, hat.country].filter(Boolean).join(', ')
  const availabilityWindow = formatAvailabilityWindow(hat)

  return (
    <div className="max-w-[720px] mx-auto space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-black/50 hover:text-black transition"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="bg-white rounded-[24px] border-[1.5px] border-black overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <div className="relative aspect-[4/3] sm:aspect-[16/9] bg-[#F5F3EF]">
          {current?.url ? (
            current.type === 'video' ? (
              <video
                src={cldVideo(current.url, { w: 1080 })}
                poster={cldVideoPoster(current.url, { w: 1080, h: 810 })}
                controls
                preload="metadata"
                className="w-full h-full object-cover"
              />
            ) : (
              <img src={cldImage(current.url, { w: 1080, h: 810 })} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-black/30 text-[13px] font-medium">
              No media
            </div>
          )}
          <div className="absolute top-3 right-3">
            <AvailabilityBadge available={hat.availability} />
          </div>
          {current?.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <p className="text-white text-[13px] font-medium leading-snug">{current.caption}</p>
            </div>
          )}
        </div>

        {media.length > 1 && (
          <div className="flex gap-2 p-3 overflow-x-auto border-b-[1.5px] border-black/5">
            {media.map((m, i) => (
              <button
                key={m.id || i}
                type="button"
                onClick={() => setActiveMedia(i)}
                className={`relative w-16 h-16 rounded-[10px] overflow-hidden shrink-0 border-[1.5px] ${
                  i === activeMedia ? 'border-black' : 'border-black/10'
                }`}
              >
                {m.type === 'video' ? (
                  <img
                    src={cldVideoPoster(m.url, { w: 64, h: 64 })}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={cldImage(m.url, { w: 64, h: 64 })}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <UserIdentity
              user={identityFromHat(hat)}
              showAvatar={false}
              nameAs="h1"
              nameClassName="text-[20px] font-bold leading-tight"
              nameBadge={hat.is_verified ? <span className="text-[#0A13E6]">✓</span> : null}
              usernameClassName="text-[13px] font-semibold text-black/55 leading-tight"
            >
              <p className="text-[13px] text-black/60 mt-0.5">{hat.hat_title}</p>
            </UserIdentity>
            <span className="font-bold text-[16px] whitespace-nowrap">{formatPrice(hat, currency)}</span>
          </div>

          {hat.motto && <p className="text-[13px] text-black/80 italic leading-snug">"{hat.motto}"</p>}

          <div className="flex flex-wrap gap-1.5">
            {hat.category && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10">
                {hat.category}
              </span>
            )}
            {location && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 flex items-center gap-1">
                <MapPin size={11} /> {location}
              </span>
            )}
            {availabilityWindow && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 flex items-center gap-1">
                <Clock size={11} /> {availabilityWindow}
              </span>
            )}
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 flex items-center gap-1">
              <Star size={11} className="text-amber-400 fill-amber-400" /> {Number(hat.rating || 0).toFixed(1)}
            </span>
            <button
              type="button"
              onClick={handleLike}
              aria-pressed={liked}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 flex items-center gap-1"
            >
              <Heart size={11} className={liked ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} /> {likeCount}
            </button>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10 flex items-center gap-1">
              <Eye size={11} /> {viewCount}
            </span>
          </div>

          {hat.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hat.skills.map((s) => (
                <span
                  key={s}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-black/10 text-black/60"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {hat.role === 'talent' ? (
            <button
              type="button"
              disabled={booking}
              onClick={handleBook}
              className="tw-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <BookOpen size={16} /> {booking ? 'Booking…' : 'Book Talent'}
            </button>
          ) : (
            <button
              type="button"
              disabled={applying || appliedStatus === 'pending' || appliedStatus === 'accepted'}
              onClick={handleApply}
              className="tw-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Send size={16} />
              {applying
                ? 'Applying…'
                : appliedStatus === 'accepted'
                ? 'Application accepted'
                : appliedStatus === 'pending'
                ? 'Applied'
                : 'Apply'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
