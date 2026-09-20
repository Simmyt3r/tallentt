// Path: src/components/profile/ProfileView.jsx
import { useState } from 'react'
import { isBusinessIdentity } from '../../lib/profile.js'
import ProfileHeader from './ProfileHeader.jsx'
import PortfolioSection from './PortfolioSection.jsx'
import ActiveHatsSection from './ActiveHatsSection.jsx'
import ReviewsSection from './ReviewsSection.jsx'
import ProfileCompletenessCard from './ProfileCompletenessCard.jsx'
import ProfileSkeleton from './ProfileSkeleton.jsx'

const ABOUT_PREVIEW_LEN = 220

function AboutSection({ bio }) {
  const [expanded, setExpanded] = useState(false)
  if (!bio) return null
  const isLong = bio.length > ABOUT_PREVIEW_LEN
  const shown = expanded || !isLong ? bio : `${bio.slice(0, ABOUT_PREVIEW_LEN).trimEnd()}…`
  return (
    <section aria-labelledby="about-heading" className="space-y-2">
      <h2 id="about-heading" className="text-[15px] font-bold tracking-tight">
        About
      </h2>
      <p className="text-[13px] text-black/70 leading-relaxed whitespace-pre-wrap break-words">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] font-semibold text-[#0A13E6] hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  )
}

function ChipListSection({ id, title, items }) {
  if (!items?.length) return null
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h2 id={id} className="text-[15px] font-bold tracking-tight">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <span key={s} className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-[#F5F3EF] border-[1.5px] border-black/10">
            {s}
          </span>
        ))}
      </div>
    </section>
  )
}

function SectionNav({ links }) {
  if (links.length < 2) return null
  return (
    <nav
      aria-label="Profile sections"
      className="flex gap-4 overflow-x-auto border-b-[1.5px] border-black/10 pb-2 -mx-1 px-1"
    >
      {links.map(({ href, label }) => (
        <a key={href} href={href} className="text-[12px] font-bold text-black/50 hover:text-black whitespace-nowrap transition">
          {label}
        </a>
      ))}
    </nav>
  )
}

export default function ProfileView({
  status = 'ready', // 'loading' | 'not-found' | 'ready'
  isOwner,
  profileUser,
  portfolio = [],
  hats = { talent: [], client: [] },
  isVerified = false,
  rating = 0,
  ratedHatsCount = 0,
  onEditClick,
}) {
  if (status === 'loading') return <ProfileSkeleton />

  if (status === 'not-found') {
    return (
      <div className="max-w-[480px] mx-auto text-center py-16 space-y-2">
        <h1 className="text-[17px] font-bold">Profile unavailable</h1>
        <p className="text-[13px] text-black/50">This profile may have been removed or the link may be incorrect.</p>
      </div>
    )
  }

  const isBusiness = isBusinessIdentity(profileUser.role)
  const skillsCount = profileUser.skills?.length || 0
  const industryCount = profileUser.industry?.length || 0

  const navLinks = [
    profileUser.bio && { href: '#about-heading', label: 'About' },
    !isBusiness && portfolio.length > 0 && { href: '#portfolio-heading', label: 'Portfolio' },
    hats.talent.length > 0 && { href: '#available-for-heading', label: 'Hats' },
    (isBusiness || hats.client.length > 0) && { href: '#hiring-heading', label: 'Hiring' },
    { href: '#reviews-heading', label: 'Reviews' },
  ].filter(Boolean)

  return (
    <div className="max-w-[720px] mx-auto space-y-6 pb-8">
      <ProfileHeader
        user={profileUser}
        isOwner={isOwner}
        isVerified={isVerified}
        ratingSummary={ratedHatsCount ? { rating: rating.toFixed(1), count: ratedHatsCount } : null}
        hasTalentHats={hats.talent.length > 0}
        hasClientHats={hats.client.length > 0}
        onEditClick={onEditClick}
      />

      {isOwner && (
        <ProfileCompletenessCard
          role={profileUser.role}
          user={profileUser}
          skillsCount={skillsCount}
          industryCount={industryCount}
          portfolioCount={portfolio.length}
        />
      )}

      <SectionNav links={navLinks} />

      <AboutSection bio={profileUser.bio} />

      {isBusiness ? (
        <ChipListSection id="industry-heading" title="Industry" items={profileUser.industry} />
      ) : (
        <ChipListSection id="skills-heading" title="Skills" items={profileUser.skills} />
      )}

      {!isBusiness && <PortfolioSection items={portfolio} isOwner={isOwner} />}

      <ActiveHatsSection role={profileUser.role} talentHats={hats.talent} clientHats={hats.client} />

      <ReviewsSection rating={rating} ratedHatsCount={ratedHatsCount} />
    </div>
  )
}
