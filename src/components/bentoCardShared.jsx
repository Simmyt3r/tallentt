import { useEffect, useState } from 'react'
import { cldImage } from '../lib/cloudinary'

// Shared by BentoCard.jsx and BentoCardDetailModal.jsx — both render the
// same underlying hat data (money, time, availability) and the same
// owner/username avatar, so those pieces live here once instead of as two
// copies that could quietly drift apart.

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

// Mirrors api/_lib/hatFields.js's formatPrice — fixed (rate + unit) vs
// range (min–max, optionally negotiable). Used for the feed's partial
// hat shape (price_type/rate/rate_unit/...).
export function formatPrice(hat, currency) {
  if (hat.price_type === 'range' && hat.price_min != null) {
    const base =
      hat.price_max != null && hat.price_max !== hat.price_min
        ? `${fmtMoney(hat.price_min, currency)} – ${fmtMoney(hat.price_max, currency)}`
        : fmtMoney(hat.price_min, currency)
    return hat.price_negotiable ? `${base} · negotiable` : base
  }
  if (hat.rate != null) {
    const unit = hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit ? `/${hat.rate_unit}` : ''
    return `${fmtMoney(hat.rate, currency)}${unit ? ` ${unit}` : ''}`
  }
  return '—'
}

// "15:00:00" (DB TIME) or "15:00" (HTML time input) -> "3:00 PM"
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
  if (!hat.available_from && !hat.available_to) return ''
  if (hat.available_from && hat.available_to) {
    return `${formatTime(hat.available_from)} – ${formatTime(hat.available_to)}`
  }
  return formatTime(hat.available_from || hat.available_to)
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