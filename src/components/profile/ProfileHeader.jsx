// Path: src/components/profile/ProfileHeader.jsx
import { useState } from 'react'
import { BadgeCheck, Share2, Star } from 'lucide-react'
import { Avatar } from '../bentoCardShared.jsx'
import { formatIdentityLine, isBusinessIdentity } from '../../lib/profile.js'

export default function ProfileHeader({
  user,
  isOwner,
  isVerified,
  ratingSummary,
  hasTalentHats,
  hasClientHats,
  onEditClick,
}) {
  const [copied, setCopied] = useState(false)
  const isBusiness = isBusinessIdentity(user.role)
  const identityLine = formatIdentityLine(user)
  const canonicalUrl = `${window.location.origin}/profile/${user.username}`

  async function handleShare() {
    const shareData = { title: identityLine, url: canonicalUrl }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // User cancelled the native share sheet — fall through to clipboard
      // only if share() itself wasn't supported; a cancel shouldn't also
      // copy silently behind their back.
      return
    }
    try {
      await navigator.clipboard.writeText(canonicalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — nothing more we can do without alert().
    }
  }

  const secondaryHref = isBusiness ? (hasClientHats ? '#hiring-heading' : null) : hasTalentHats ? '#available-for-heading' : null

  return (
    <header className="rounded-[22px] border-[1.5px] border-black/10 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <Avatar src={user.avatarUrl} name={user.fullName || user.username} className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-[17px] font-extrabold tracking-tight truncate">{identityLine}</h1>
            {isVerified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#0A13E6]" title="Has a verified business name on file">
                <BadgeCheck size={14} className="fill-[#0A13E6]/15" />
                Verified
              </span>
            )}
          </div>
          {user.headline && <p className="text-[13px] font-semibold text-black/70 truncate mt-0.5">{user.headline}</p>}
          {(user.location || user.lga) && (
            <p className="text-[12px] text-black/45 font-medium truncate">{user.location || [user.lga, user.country].filter(Boolean).join(', ')}</p>
          )}
          {ratingSummary && (
            <p className="flex items-center gap-1 text-[12px] font-semibold mt-1">
              <Star size={12} className="text-amber-400 fill-amber-400" />
              {ratingSummary.rating} <span className="text-black/40 font-medium">· {ratingSummary.count} rated {ratingSummary.count === 1 ? 'hat' : 'hats'}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share profile"
          className="relative w-9 h-9 rounded-full border-[1.5px] border-black/10 flex items-center justify-center shrink-0 hover:border-black transition"
        >
          <Share2 size={15} />
          {copied && (
            <span className="absolute -bottom-8 right-0 whitespace-nowrap text-[11px] font-bold bg-black text-white px-2.5 py-1 rounded-full shadow">
              Link copied
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {isOwner ? (
          <button type="button" onClick={onEditClick} className="tw-btn-primary h-9 px-4 text-[12px]">
            Edit Profile
          </button>
        ) : (
          secondaryHref && (
            <a href={secondaryHref} className="tw-btn-primary h-9 px-4 text-[12px] inline-flex items-center">
              {isBusiness ? 'View Opportunities' : 'View Hats'}
            </a>
          )
        )}
      </div>
    </header>
  )
}
