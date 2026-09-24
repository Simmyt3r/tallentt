// Path: src/components/bentoCardShared.jsx
import { useEffect, useState } from 'react'
import { Heart, Share2, X } from 'lucide-react'
import { api } from '../lib/api'
import { cldImage } from '../lib/cloudinary'

// Shared by BentoCard.jsx and BentoCardDetailModal.jsx — both render the
// same underlying hat data (money, time, availability), the same
// owner/username avatar, the same like-toggle behavior, and the same
// share/owner-link affordances, so those pieces live here once instead of
// as copies that could quietly drift apart.

export const fmtMoney = (n, currency = 'NGN') => {
  if (n == null) return '—'
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

// Hats use Fixed or Range. Range is a real minimum-to-maximum amount and
// automatically uses the existing offer/negotiation flow.
export function formatPrice(hat, currency) {
  if (hat.price_type === 'range' && hat.price_min != null) {
    const base =
      hat.price_max != null && hat.price_max !== hat.price_min
        ? `${fmtMoney(hat.price_min, currency)} – ${fmtMoney(hat.price_max, currency)}`
        : fmtMoney(hat.price_min, currency)
    return base
  }
  if (hat.rate != null) {
    const unit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit ? `/${hat.rate_unit}` : ''
    const base = `${fmtMoney(hat.rate, currency)}${unit ? ` ${unit}` : ''}`
    return hat.price_negotiable ? `${base} • Range` : base
  }
  return '—'
}

// Same idea as formatPrice above, adapted for the normalized `budget`
// object the detail API returns (api/hats/[id].js buildCardDetail):
// { type, currency, amount, min, max, unit, negotiable }.
export function formatBudget(budget) {
  if (!budget) return '—'
  const currency = budget.currency || 'NGN'
  if (budget.type === 'range' && budget.min != null) {
    const base =
      budget.max != null && budget.max !== budget.min
        ? `${fmtMoney(budget.min, currency)} – ${fmtMoney(budget.max, currency)}`
        : fmtMoney(budget.min, currency)
    return base
  }
  if (budget.amount != null) {
    const unitText = budget.unit ? (budget.unit.includes(' ') ? ` ${budget.unit}` : ` /${budget.unit}`) : ''
    const base = `${fmtMoney(budget.amount, currency)}${unitText}`
    return budget.negotiable ? `${base} • Range` : base
  }
  return '—'
}

// "15:00:00" (DB TIME) or "15:00" (HTML time input) -> "3:00 PM"
const AVAILABILITY_DAYS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]

export function formatAvailableDays(days) {
  const order = AVAILABILITY_DAYS.map(([value]) => value)
  const selected = Array.isArray(days) && days.length
    ? order.filter((day) => days.includes(day))
    : order
  const labels = new Map(AVAILABILITY_DAYS)
  if (selected.length === 7) return 'Mon–Sun'

  const indexes = selected.map((day) => order.indexOf(day))
  const contiguous = indexes.every((value, index) => index === 0 || value === indexes[index - 1] + 1)
  if (contiguous && selected.length >= 2) {
    return `${labels.get(selected[0])}–${labels.get(selected[selected.length - 1])}`
  }
  return selected.map((day) => labels.get(day)).join(', ')
}

export function formatTime(t) {
  if (!t) return ''
  const [hStr, mStr] = String(t).split(':')
  let h = Number(hStr)
  const m = Number(mStr || 0)
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatAvailabilityWindow(hat) {
  const days = formatAvailableDays(hat.available_days)
  let time = 'Flexible hours'
  if (hat.available_from && hat.available_to) {
    time = `${formatTime(hat.available_from)} – ${formatTime(hat.available_to)}`
  } else if (hat.available_from || hat.available_to) {
    time = formatTime(hat.available_from || hat.available_to)
  }
  return [days, time].filter(Boolean).join(' · ')
}

// "2024-05-01T12:00:00Z" -> "2h", "3d", etc. Mirrors the relative-time
// logic already used by NotificationsMenu.jsx for "time posted" on cards.
export function relativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Avatar({ src, name, className = 'w-12 h-12' }) {
  const [err, setErr] = useState(false)
  // Without this, an avatar that failed to load once would keep showing
  // the initials fallback forever even after `src` changes to a working
  // URL — e.g. the modal's avatar source moves from the feed's partial
  // `hat.owner_avatar` to the fuller detail's `owner.avatar_url` once it
  // loads, and those aren't always the same value.
  useEffect(() => {
    setErr(false)
  }, [src])
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (!src || err) {
    return (
      <div className={`${className} rounded-full bg-black text-white flex items-center justify-center font-bold text-[12px] border-[1.5px] border-black shrink-0`}>
        {initials}
      </div>
    )
  }
  return (
    <img
      src={cldImage(src, { w: 96, h: 96 })}
      alt={name}
      className={`${className} rounded-full object-cover border-[1.5px] border-black shrink-0`}
      onError={() => setErr(true)}
    />
  )
}

// The canonical, shareable URL for a hat — built from the current origin
// rather than a hard-coded production domain, so it works in dev, preview
// deployments, and production alike.
export function canonicalHatUrl(hatId) {
  return `${window.location.origin}/hat/${hatId}`
}

// Web Share API when available, clipboard fallback otherwise. Returns a
// short status string ('shared' | 'copied' | 'cancelled' | 'error') so the
// caller can decide what (if anything) to show — this never throws.
export async function shareHat({ hatId, title, context }) {
  const url = canonicalHatUrl(hatId)
  const text = [context, title].filter(Boolean).join(' — ')
  if (navigator.share) {
    try {
      await navigator.share({ title: title || 'ChombuTar', text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // Some browsers advertise navigator.share but reject certain payloads
      // (e.g. no user gesture context) — fall through to clipboard rather
      // than surfacing a dead end.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'error'
  }
}

// Icon-only share action used by both BentoCard and BentoCardDetailModal.
// Self-contained: builds the canonical URL, calls the Web Share API or
// falls back to clipboard, and shows its own transient "Link copied"
// feedback — no application alert() and no state the parent needs to own.
// Always stops propagation: it sits inside surfaces that are themselves
// clickable, and a click here should only ever share.
export function ShareButton({ hatId, title, context, className = '' }) {
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(''), 1800)
    return () => clearTimeout(t)
  }, [feedback])

  async function handleShare(e) {
    e.stopPropagation()
    e.preventDefault()
    if (!hatId) return
    const result = await shareHat({ hatId, title, context })
    if (result === 'copied') setFeedback('Link copied')
    else if (result === 'error') setFeedback('Could not copy link')
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleShare}
        aria-label="Share"
        className={`w-8 h-8 rounded-full flex items-center justify-center text-black/55 hover:bg-black/[0.06] hover:text-black transition ${className}`}
      >
        <Share2 size={16} />
      </button>
      {feedback && (
        <span className="absolute top-full right-0 mt-1.5 z-10 whitespace-nowrap text-[10.5px] font-semibold bg-black text-white px-2.5 py-1 rounded-full shadow-lg">
          {feedback}
        </span>
      )}
    </span>
  )
}

// Icon-only like toggle. Purely presentational — state/mutation lives in
// useLikeToggle below so BentoCard and BentoCardDetailModal share the exact
// same optimistic-update behavior instead of each keeping its own copy.
export function LikeButton({ liked, onToggle, disabled, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle?.()
      }}
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike' : 'Like'}
      className={`w-8 h-8 rounded-full flex items-center justify-center text-black/55 hover:bg-black/[0.06] hover:text-black transition disabled:opacity-50 ${className}`}
    >
      <Heart size={16} className={liked ? 'fill-[#FF3B5C] text-[#FF3B5C]' : ''} />
    </button>
  )
}

// Optimistic like/unlike, shared by BentoCard's new header action and
// BentoCardDetailModal's engagement row — same api.toggleLike call, same
// rollback-on-failure behavior, same onHatChange patch-up so whichever of
// the two isn't currently mounted still sees the new count once it is.
export function useLikeToggle({ id, liked: initialLiked, count: initialCount, onHatChange }) {
  const [liked, setLiked] = useState(!!initialLiked)
  const [count, setCount] = useState(initialCount || 0)
  const [liking, setLiking] = useState(false)

  useEffect(() => {
    setLiked(!!initialLiked)
    setCount(initialCount || 0)
  }, [id, initialLiked, initialCount])

  async function toggle() {
    if (liking || !id) return
    setLiking(true)
    const next = !liked
    const nextCount = count + (next ? 1 : -1)
    setLiked(next)
    setCount(nextCount)
    try {
      await api.toggleLike(id)
      onHatChange?.({ id, liked_by_me: next, likes: nextCount })
    } catch {
      // Restore the previous state — never leave the UI showing a like the
      // server rejected (e.g. session expired, so the PATCH 401s).
      setLiked(!next)
      setCount(count)
    } finally {
      setLiking(false)
    }
  }

  return { liked, count, liking, toggle }
}

// Shared owner header — the owner's identity (a <UserIdentity /> handed in by
// the caller, so avatar, name and username all link to their profile) and the
// Share/Like (and, in the modal, Close) actions. It is the modal's top bar.
// Keeping one implementation means every place that shows it can never
// quietly drift in what it shows or how it handles clicks.
export function HatOwnerHeader({
  identity,
  hatId,
  shareTitle,
  shareContext,
  liked,
  onToggleLike,
  likeDisabled,
  onClose,
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">{identity}</div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ShareButton hatId={hatId} title={shareTitle} context={shareContext} />
        <LikeButton liked={liked} onToggle={onToggleLike} disabled={likeDisabled} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-black/55 hover:bg-black hover:text-white transition"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// The informational negotiation-fee confirmation from the spec: shown when
// the user starts the primary action on a negotiable-price hat. This is
// deliberately NOT built from .modal-overlay/.modal-panel (which go
// full-screen below 768px) — a two-button confirmation should stay a small
// centered card on every screen size, not take over the viewport.
//
// `fee` is left undefined unless the app actually has a real, dynamic fee
// value to show — there is none in this codebase today (no
// negotiation-fee field or config anywhere in api/), so this always
// renders the generic message rather than inventing a number.
export function NegotiationFeeNotice({ open, fee, onCancel, onContinue }) {
  if (!open) return null
  // This renders nested inside BentoCardDetailModal's own overlay (whose
  // backdrop click also means "close"), so every click here has to stop
  // propagation — otherwise dismissing this notice would also close the
  // parent modal, which the spec explicitly says must not happen
  // ("Cancel: ... Keep the BentoCardDetailModal open").
  function stop(handler) {
    return (e) => {
      e.stopPropagation()
      handler?.()
    }
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Price Negotiation"
      onClick={stop(onCancel)}
    >
      <div
        className="bg-white rounded-[20px] border-[1.5px] border-black w-full max-w-[360px] p-5 space-y-4 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-bold">Negotiation fee applies</h3>
        <p className="text-[13px] text-black/70 leading-relaxed">
          {fee
            ? `This listing uses Range pricing. A negotiation fee of ${fee} applies if you continue.`
            : 'This listing uses Range pricing. A negotiation fee applies if you continue.'}
        </p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={stop(onCancel)} className="tw-btn-ghost flex-1 h-11">
            Cancel
          </button>
          <button type="button" onClick={stop(onContinue)} className="tw-btn-primary flex-1 h-11">
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export function NegotiationProposalModal({
  open,
  min,
  max,
  currency = 'NGN',
  payUnit,
  actionLabel = 'Continue',
  onCancel,
  onSubmit,
}) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setMessage('')
    setError('')
    setSubmitting(false)
  }, [open])

  if (!open) return null

  async function submit(e) {
    e.preventDefault()
    e.stopPropagation()
    if (submitting) return
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) {
      setError('Enter a valid whole-number proposal.')
      return
    }
    if (Number.isFinite(Number(min)) && value < Number(min)) {
      setError(`Proposal must be at least ${fmtMoney(min, currency)}.`)
      return
    }
    if (Number.isFinite(Number(max)) && value > Number(max)) {
      setError(`Proposal must not exceed ${fmtMoney(max, currency)}.`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await onSubmit?.({ amount: value, message: message.trim() })
      if (!result) setSubmitting(false)
    } catch (err) {
      setError(err?.message || 'Could not send this proposal. Please try again.')
      setSubmitting(false)
    }
  }

  const range = [
    min != null ? fmtMoney(min, currency) : null,
    max != null ? fmtMoney(max, currency) : null,
  ].filter(Boolean).join(' – ')

  return (
    <div
      className="fixed inset-0 z-[61] flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Make your first proposal"
      onClick={(e) => {
        e.stopPropagation()
        onCancel?.()
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[390px] rounded-[22px] border-[1.5px] border-black bg-white p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] space-y-4"
      >
        <div>
          <h3 className="text-[17px] font-black">Make your proposal</h3>
          <p className="mt-1 text-[12px] font-medium text-black/55">
            Range: {range || 'Flexible'}{payUnit ? ` / ${payUnit}` : ''}
          </p>
        </div>

        <label className="block text-[12px] font-bold">
          Proposed amount
          <div className="mt-1.5 flex items-center rounded-[13px] border-[1.5px] border-black bg-[#F7F3EB] px-3">
            <span className="shrink-0 text-[12px] font-black text-black/45">{currency}</span>
            <input
              autoFocus
              type="number"
              min={min || 1}
              max={max || 2147483647}
              step="1"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError('')
              }}
              placeholder={min ? String(min) : '50000'}
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[14px] font-bold outline-none"
            />
          </div>
        </label>

        <label className="block text-[12px] font-bold">
          Message <span className="font-medium text-black/35">Optional</span>
          <textarea
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add context for your offer"
            className="mt-1.5 w-full resize-none rounded-[13px] border-[1.5px] border-black bg-white p-3 text-[13px] outline-none focus:ring-4 focus:ring-black/[0.04]"
          />
        </label>

        {error && <p role="alert" className="text-[11.5px] font-semibold text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={submitting} className="tw-btn-ghost flex-1 h-11 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={submitting} className="tw-btn-primary flex-1 h-11 disabled:opacity-60">
            {submitting ? 'Sending…' : actionLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
