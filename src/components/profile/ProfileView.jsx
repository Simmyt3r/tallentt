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

function SectionNav({ tabs, activeTab, onSelect }) {
  function handleKeyDown(event, index) {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1 : null
    if (nextIndex == null) return
    event.preventDefault()
    onSelect(tabs[nextIndex].id)
    document.getElementById(`profile-${tabs[nextIndex].id}-tab`)?.focus()
  }

  return (
    <nav
      aria-label="Profile sections"
      className="flex gap-5 overflow-x-auto border-b-[1.5px] border-black/10 -mx-1 px-1"
      role="tablist"
    >
      {tabs.map(({ id, label }, index) => (
        <button
          key={id}
          id={`profile-${id}-tab`}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          aria-controls={`profile-${id}-panel`}
          tabIndex={activeTab === id ? 0 : -1}
          onClick={() => onSelect(id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`text-[13px] font-bold whitespace-nowrap border-b-2 pb-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0A13E6] ${activeTab === id ? 'text-[#0A13E6] border-[#0A13E6]' : 'text-black/50 border-transparent hover:text-black'}`}
        >
          {label}
        </button>
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
  const [activeTab, setActiveTab] = useState('portfolio')

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

  const tabs = [
    !isBusiness && { id: 'portfolio', label: 'Portfolio' },
    { id: 'hats', label: 'Hats' },
    { id: 'reviews', label: 'Reviews' },
  ].filter(Boolean)
  const selectedTab = tabs.some(({ id }) => id === activeTab) ? activeTab : tabs[0].id

  function showHats() {
    setActiveTab('hats')
    document.getElementById('profile-hats-tab')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
        onShowHats={showHats}
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

      <AboutSection bio={profileUser.bio} />

      {isBusiness ? (
        <ChipListSection id="industry-heading" title="Industry" items={profileUser.industry} />
      ) : (
        <ChipListSection id="skills-heading" title="Skills" items={profileUser.skills} />
      )}

      <SectionNav tabs={tabs} activeTab={selectedTab} onSelect={setActiveTab} />

      {tabs.map(({ id }) => (
        <div
          key={id}
          id={`profile-${id}-panel`}
          role="tabpanel"
          aria-labelledby={`profile-${id}-tab`}
          tabIndex={id === selectedTab ? 0 : -1}
          hidden={id !== selectedTab}
        >
          {id === selectedTab && id === 'portfolio' && (
            portfolio.length || isOwner ? <PortfolioSection items={portfolio} isOwner={isOwner} />
              : <p className="text-[12px] text-black/40 font-medium">No portfolio items yet.</p>
          )}
          {id === selectedTab && id === 'hats' && (
            hats.talent.length || hats.client.length || isBusiness
              ? <ActiveHatsSection role={profileUser.role} talentHats={hats.talent} clientHats={hats.client} />
              : <p className="text-[12px] text-black/40 font-medium">No active Hats yet.</p>
          )}
          {id === selectedTab && id === 'reviews' && <ReviewsSection rating={rating} ratedHatsCount={ratedHatsCount} />}
        </div>
      ))}
    </div>
  )
}
