// Path: src/components/profile/ProfileHeader.jsx
import { useState } from 'react'
import { BadgeCheck, Eye, Share2, Star } from 'lucide-react'
import ProfilePhotoViewer from '../ProfilePhotoViewer.jsx'
import UserIdentity from '../UserIdentity.jsx'
import { getPrimaryIdentity, getProfilePath, isBusinessIdentity } from '../../lib/profile.js'

export default function ProfileHeader({
  user,
  isOwner,
  isVerified,
  businessVerified=false,
  ratingSummary,
  hasTalentHats,
  hasClientHats,
  onEditClick,
  onShowHats,
  orbit,
  networkCounts,
  onShowAssociates,
}) {
  const [copied, setCopied] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const isBusiness = isBusinessIdentity(user.role)
  const identityLine = getPrimaryIdentity(user)
  const canonicalUrl = `${window.location.origin}${getProfilePath(user) || ''}`

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

  const showHatsAction = isBusiness ? hasClientHats : hasTalentHats

  return (
    <header className="rounded-[22px] border-[1.5px] border-black/10 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <UserIdentity
          user={user}
          align="start"
          gap="gap-4"
          className="flex-1"
          avatarClassName="w-16 h-16 sm:w-20 sm:h-20"
          onAvatarClick={(user.avatarUrl||user.avatar_url)?()=>setPhotoOpen(true):null}
          avatarBadge={(user.avatarUrl||user.avatar_url)?<span aria-hidden="true" className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#0A13E6] text-white shadow-sm"><Eye size={12}/></span>:null}
          nameAs="h1"
          nameClassName="text-[17px] font-extrabold tracking-tight"
          usernameClassName="text-[13px] font-bold text-[#0A13E6] leading-tight"
          nameBadge={
            businessVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E7ECFF] px-2 py-1 text-[10px] font-black text-[#0A13E6]" title="Business registration manually reviewed by ChombuTar; not a guarantee of future performance"><BadgeCheck size={14}/> Business verified</span>
            ) : isVerified ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#0A13E6]" title="Has a verified business name on file">
                <BadgeCheck size={14} className="fill-[#0A13E6]/15" />
                Verified
              </span>
            ) : null
          }
        >
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
        </UserIdentity>
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

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
        {orbit && <span className="font-black text-[#0A13E6]">Orbit {orbit.score}/100</span>}
        <button type="button" onClick={onShowAssociates} className="font-bold text-black/70 underline underline-offset-2">
          {networkCounts?.associates ?? '—'} Associates
        </button>
        <button type="button" onClick={onShowAssociates} className="font-bold text-black/70 underline underline-offset-2">
          {networkCounts?.subscribers ?? '—'} Subscribers
        </button>
      </div>
      {(user.avatarUrl||user.avatar_url)&&<button type="button" onClick={()=>setPhotoOpen(true)}
        className="mt-2 text-[11px] font-bold text-[#0A13E6] underline underline-offset-2">
        View full profile picture
      </button>}
      <div className="flex items-center gap-2 mt-4">
        {isOwner ? (
          <button type="button" onClick={onEditClick} className="tw-btn-primary h-9 px-4 text-[12px]">
            Edit Profile
          </button>
        ) : (
          showHatsAction && (
            <button type="button" onClick={onShowHats} className="tw-btn-primary h-9 px-4 text-[12px] inline-flex items-center">
              {isBusiness ? 'View Opportunities' : 'View Hats'}
            </button>
          )
        )}
      </div>
      {photoOpen&&<ProfilePhotoViewer src={user.avatarUrl||user.avatar_url}
        name={identityLine} onClose={()=>setPhotoOpen(false)}/>}
    </header>
  )
}
