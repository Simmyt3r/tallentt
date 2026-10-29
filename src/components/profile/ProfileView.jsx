// Path: src/components/profile/ProfileView.jsx
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {useAuth} from '../../context/AuthContext.jsx'
import { publicTalentCard } from '../../../api/_lib/talentCard.js'
import { talentGroups, talentPortfolio, resolveTalent } from '../../lib/talentCard.js'
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
  employment = null,
  onEditClick,
}) {
  const {user:viewer}=useAuth()
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab')==='associates'?'associates':'portfolio')
  const [social, setSocial] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [shareStatus, setShareStatus] = useState('')
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
  const card = publicTalentCard(profileUser.talentCard)
  const groups = talentGroups(hats.talent, card.mainTalent)
  const selectedTalent = resolveTalent(searchParams.get('talent'), groups)
  const shownPortfolio = talentPortfolio(portfolio, hats.talent, selectedTalent, card.featuredMedia)
  function selectTalent(name) {
    setShareStatus('')
    const next = new URLSearchParams(searchParams)
    if (name) next.set('talent', name); else next.delete('talent')
    next.delete('tab')
    setSearchParams(next)
    setActiveTab('portfolio')
  }
  async function shareTalent() {
    const url = new URL(`/profile/${encodeURIComponent(profileUser.username)}`, window.location.origin)
    if (selectedTalent) url.searchParams.set('talent', selectedTalent)
    try { await navigator.clipboard.writeText(url.href); setShareStatus('Link copied') }
    catch { setShareStatus(url.href) }
  }
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

      {!isBusiness && <section aria-label="Talent Card" className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold">Talents & work</h2><button type="button" onClick={shareTalent} className="text-xs font-semibold text-[#0A13E6]">Copy talent link</button></div>
        <div className="flex flex-wrap gap-2">{card.workModes.map(mode => <span key={mode} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Open to {mode}</span>)}</div>
        {card.availability !== 'not-specified' && <p className="text-sm">{{available:'Available now', busy:'Currently busy', 'not-looking':'Not looking for work'}[card.availability]} <span className="text-xs text-black/50">· Self-reported</span></p>}
        {employment?.employed&&<p className="text-xs font-semibold text-green-700">Employed via ChombuTar · agreement accepted by both parties</p>}
        {Number(employment?.confirmed_months)>0&&<p className="text-xs text-black/60">{employment.confirmed_months} salary periods confirmed received · amounts private</p>}
        {card.workModes.includes('Full-time') && <p className="text-xs text-black/60">Salary expectation: {card.salary.visibility === 'range' ? 'NGN ' + Number(card.salary.min).toLocaleString() + '–' + Number(card.salary.max).toLocaleString() + '/month' : card.salary.visibility === 'tier' ? card.salary.tier + ' level' : 'Private · ask me'}</p>}
        <div role="group" aria-label="Filter by talent" className="flex flex-wrap gap-2">
          {['', ...groups].map(name => <button type="button" key={name} aria-pressed={selectedTalent === name} onClick={() => selectTalent(name)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selectedTalent === name ? 'bg-[#0A13E6] text-white border-[#0A13E6]' : 'border-black/15'}`}>{name || 'All'}{name && name === card.mainTalent ? ' · Main' : ''}</button>)}
        </div>
        <p className="text-xs text-black/50">{selectedTalent ? 'Portfolio and Talent Hats for ' + selectedTalent : 'Featured portfolio · up to three selected works'}</p>
        {shareStatus && <p role="status" className="break-all text-xs text-blue-700">{shareStatus}</p>}
        {!isOwner&&['client','dual'].includes(viewer?.role)&&card.workModes.includes('Full-time')&&<Link className="inline-block rounded-xl bg-[#0A13E6] px-4 py-2 text-xs font-bold text-white" to={'/inbox?hire='+encodeURIComponent(profileUser.username)}>Hire full-time</Link>}
      </section>}

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
            shownPortfolio.length || isOwner ? <PortfolioSection key={selectedTalent || 'all'} items={shownPortfolio} isOwner={isOwner} />
              : <p className="text-[12px] text-black/40 font-medium">No portfolio items yet.</p>
          )}
          {id === selectedTab && id === 'hats' && (
            hats.talent.length || hats.client.length || isBusiness
              ? <ActiveHatsSection role={profileUser.role} talentHats={selectedTalent ? hats.talent.filter(h => h.category === selectedTalent) : hats.talent} clientHats={hats.client} />
              : <p className="text-[12px] text-black/40 font-medium">No active Hats yet.</p>
          )}
          {id === selectedTab && id === 'associates' && <AssociatesSection data={social} isOwner={isOwner} onRefresh={refreshSocial} />}
           {id === selectedTab && id === 'reviews' && <ReviewsSection rating={rating} ratedHatsCount={ratedHatsCount} />}
        </div>
      ))}
    </div>
  )
}
