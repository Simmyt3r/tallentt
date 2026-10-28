// Path: src/components/profile/ProfileView.jsx
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import AssociatesSection from './AssociatesSection.jsx'
import { isBusinessIdentity } from '../../lib/profile.js'
import ProfileHeader from './ProfileHeader.jsx'
import WorkPass from '../WorkPass.jsx'
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
  orbit = null,
  performance = null,
  onEditClick,
}) {
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab')==='associates'?'associates':'portfolio')
  const [social, setSocial] = useState(null)
  useEffect(() => {
    if(!profileUser?.username)return undefined
    let active=true
    setSocial(null)
    api.getAssociates(profileUser.username).then(data=>{if(active)setSocial(data)}).catch(()=>{})
    return()=>{active=false}
  },[profileUser?.username])
  const refreshSocial = () => api.getAssociates(profileUser.username).then(setSocial)

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
    { id: 'associates', label: 'Associates' },
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
        orbit={orbit}
        networkCounts={social?.counts}
        onShowAssociates={() => setActiveTab('associates')}
      />

      {profileUser?.username && <div className="flex justify-center"><WorkPass username={profileUser.username} compact /></div>}
      {orbit && <section aria-label="Orbit credibility indicators" className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-black">Orbit Score</h2>
            <p className="mt-1 text-[11px] text-black/55">Evidence from completed work, successful hires, activity, time and verified profile details.</p>
          </div>
          <span className="text-[24px] font-black tabular-nums text-[#0A13E6]">{orbit.score}<span className="text-[12px] text-black/40">/100</span></span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/10" role="progressbar"
          aria-label="Orbit activity score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={orbit.score}>
          <div className="h-full rounded-full bg-[#0A13E6]" style={{width:`${orbit.score}%`}}/>
        </div>
        <details className="rounded-xl border border-black/10 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold">How this score is calculated</summary>
          <dl className="mt-3 space-y-2">
            {(orbit.factors||[]).map(factor=><div key={factor.key} className="flex justify-between gap-2 text-[11px]">
              <dt>{factor.label}</dt><dd className="font-bold tabular-nums">{factor.earned}/{factor.possible}</dd>
            </div>)}
          </dl>
          <p className="mt-3 text-[11px] text-black/55">{orbit.disclaimer}</p>
        </details>
      </section>}
      {performance&&<section aria-label="Platform performance" className="space-y-2 rounded-2xl border border-black/10 bg-white p-4">
        <h2 className="text-[15px] font-black">Performance records</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Completed jobs',performance.completed_jobs],
            ['Successful hires',performance.successful_hires],
            ['Open disputes',performance.open_disputes],
          ].map(([label,value])=><div key={label} className="rounded-xl bg-[#F7F3EB] p-3">
            <p className="text-[19px] font-black text-[#0A13E6]">{value ?? 0}</p>
            <p className="text-[10px] font-semibold text-black/55">{label}</p>
          </div>)}
        </div>
        <p className="text-[11px] text-black/50">Figures cover this account's Hats and deals. Open disputes do not imply wrongdoing.</p>
      </section>}

      {isOwner && (
        <ProfileCompletenessCard
          role={profileUser.role}
          user={profileUser}
          skillsCount={skillsCount}
          industryCount={industryCount}
          portfolioCount={portfolio.length}
        />
      )}

      {profileUser.profileStatement
        ? <AboutSection bio={profileUser.profileStatement} />
        : <p className="rounded-xl bg-white p-4 text-[12px] text-black/55">
            {isOwner ? 'Add a professional profile statement in Edit profile.' : 'No professional statement published yet.'}
          </p>}

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
          {id === selectedTab && id === 'associates' && <AssociatesSection data={social} isOwner={isOwner} onRefresh={refreshSocial} />}
           {id === selectedTab && id === 'reviews' && <ReviewsSection rating={rating} ratedHatsCount={ratedHatsCount} />}
        </div>
      ))}
    </div>
  )
}
