// Path: src/components/profile/ProfileHeader.jsx
import { useState } from 'react'
import { BadgeCheck, Eye, Share2 } from 'lucide-react'
import ProfilePhotoViewer from '../ProfilePhotoViewer.jsx'
import UserIdentity from '../UserIdentity.jsx'
import { getPrimaryIdentity, getProfilePath, isBusinessIdentity } from '../../lib/profile.js'
import { singleDigitOrbit } from '../../lib/profileScore.js'

export default function ProfileHeader({
  user,
  isOwner,
  isVerified,
  businessVerified=false,
  hasTalentHats,
  hasClientHats,
  onEditClick,
  onShowHats,
  orbit,
}) {
  const [copied, setCopied] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const isBusiness = isBusinessIdentity(user.role)
  const identityLine = getPrimaryIdentity(user)
  const mainTalent = user.talentCard?.mainTalent || user.talent_card?.mainTalent || ''
  const orbitDigit = singleDigitOrbit(orbit?.score)
  const orbitScore = orbit?.score != null && Number.isFinite(Number(orbit.score))
    ? Math.min(100, Math.max(0, Math.round(Number(orbit.score))))
    : null
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
          {mainTalent && <p className="mt-1 break-words whitespace-normal text-[13px] font-bold leading-relaxed text-[#0A13E6]">Main talent: {mainTalent}</p>}
          {user.headline && <p className="mt-0.5 break-words whitespace-normal text-[13px] font-semibold leading-relaxed text-black/70">{user.headline}</p>}
          {(user.location || user.lga) && (
            <p className="text-[12px] text-black/45 font-medium truncate">{user.location || [user.lga, user.country].filter(Boolean).join(', ')}</p>
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

      {isOwner&&<div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-black/55" aria-label="Private account information">
        <span>Email: <span className="font-semibold text-black/75">{user.email||'Not set'}</span></span>
        <span>Account type: <span className="font-semibold capitalize text-black/75">{user.role||'Subscriber'}</span></span>
      </div>}
      {isOwner ? (
        <div className="mt-4 flex min-w-0 items-center justify-between gap-2" aria-label="Profile actions and Orbit score">
          <span className="min-w-0 whitespace-nowrap text-[11px] font-bold text-[#0A13E6] sm:text-[12px]"
            aria-label={orbitScore !== null ? `Orbit score ${orbitScore} out of 100` : 'Orbit score unavailable'}>
            Orbit Score: <strong className="text-[13px] font-black tabular-nums sm:text-[15px]">{orbitScore !== null ? `${orbitScore}/100` : '—'}</strong>
          </span>
          <button type="button" onClick={onEditClick} className="tw-btn-primary h-9 shrink-0 px-3 text-[11px] sm:px-4 sm:text-[12px]">
            Edit Profile
          </button>
        </div>
      ) : (
        <>
          {orbitDigit !== null && <div className="mt-4 flex items-center gap-3 text-[12px]">
            <span className="rounded-full bg-[#EEF0FF] px-3 py-1.5 font-black text-[#0A13E6]" aria-label={`Orbit score ${orbitDigit} on a single-digit scale`}>Orbit {orbitDigit}</span>
          </div>}
          {showHatsAction && <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onShowHats} className="tw-btn-primary h-9 px-4 text-[12px] inline-flex items-center">
              {isBusiness ? 'View Opportunities' : 'View Hats'}
            </button>
          </div>}
        </>
      )}
      {photoOpen&&<ProfilePhotoViewer src={user.avatarUrl||user.avatar_url}
        name={identityLine} onClose={()=>setPhotoOpen(false)}/>}
    </header>
  )
}
