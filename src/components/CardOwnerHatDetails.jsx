import {Link} from 'react-router-dom'
import {formatBudget,formatPrice,formatAvailabilityWindow} from './bentoCardShared.jsx'

function Item({label,children}){
  if(children==null||children===''||children===false)return null
  return <div className="min-w-0">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-black/45">{label}</dt>
    <dd className="mt-1 break-words text-[13px] font-medium text-black/85">{children}</dd>
  </div>
}
function Stat({label,value}){
  return <div className="min-w-0 rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
    <p className="text-[19px] font-black tabular-nums text-[#0A13E6]">{value}</p>
    <p className="mt-1 text-[11px] font-semibold text-black/60">{label}</p>
  </div>
}
export default function CardOwnerHatDetails({detail,hat,entertainment=false}){
  if(!hat&&!detail)return null
  const profile=detail?.owner||{}
  const job=detail?.job||{}
  const performance=detail?.performance||{}
  const orbit=performance.orbit
  const ownerHandle=profile.handle||hat?.username
  const price=detail?.budget ? formatBudget(detail.budget)
    : hat && !entertainment ? formatPrice(hat,hat.currency||'NGN') : null
  const type=job.type||detail?.hat_type||hat?.hat_type
  const duration=type==='One-Off'?null:job.duration||detail?.hiring_duration||hat?.hiring_duration
  const jobLocation=job.location||detail?.location||[hat?.lga,hat?.country].filter(Boolean).join(', ')
  const requirements=detail?.job_requirements||detail?.description||hat?.job_requirements||null
  return <div className="space-y-4" aria-label="Owner and Hat details">
    <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-4"
      aria-labelledby="detail-profile-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="detail-profile-section" className="text-[15px] font-black">Profile information</h3>
        {ownerHandle&&<Link to={`/profile/${encodeURIComponent(ownerHandle)}`}
          className="text-[12px] font-bold text-[#0A13E6] underline underline-offset-2">
          View full profile
        </Link>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label="Professional statement">
          {profile.statement || 'No professional statement published yet.'}
        </Item>
        <Item label="Joined ChombuTar">{profile.joined_at ? new Date(profile.joined_at).toLocaleDateString('en-NG',{year:'numeric',month:'long',day:'numeric'}) : 'Not available'}</Item>
        <Item label="Profile location">{profile.location}</Item>
        <Item label="Phone">
          {profile.contact_unlocked&&profile.phone ? profile.phone
            : 'Private until contacts are unlocked through a secured deal'}
        </Item>
      </dl>
    </section>

    <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-4"
      aria-labelledby="detail-performance-section">
      <h3 id="detail-performance-section" className="text-[15px] font-black">Performance records</h3>
      {detail?.performance ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Orbit activity score" value={orbit ? `${orbit.score}/100` : 'Not available'}/>
            <Stat label="Completed talent jobs" value={performance.completed_jobs ?? 0}/>
            <Stat label="Successful hires" value={performance.successful_hires ?? 0}/>
            <Stat label="Currently disputed deals" value={performance.open_disputes ?? 'Not available'}/>
          </div>
          {orbit?.factors?.length>0&&<details className="rounded-xl border border-black/10 px-3 py-2 text-[12px]">
            <summary className="cursor-pointer font-semibold">How Orbit is calculated</summary>
            <dl className="mt-2 space-y-1">
              {orbit.factors.map(f=><div key={f.key} className="flex justify-between gap-2">
                <dt>{f.label}</dt><dd>{f.earned}/{f.possible}</dd>
              </div>)}
            </dl>
          </details>}
          <p className="text-[11px] text-black/50">
            These are platform records, not a guarantee of identity, qualification or future performance.
            Institutional badges and signed credentials are not shown unless independently verified.
          </p>
        </>
      ):<p className="text-[12px] text-black/50">Performance figures are unavailable for this item.</p>}
    </section>

    {!entertainment&&<section className="space-y-3 rounded-2xl border border-black/10 bg-white p-4"
      aria-labelledby="detail-hat-section">
      <h3 id="detail-hat-section" className="text-[15px] font-black">Job information · This Hat</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label="Hat name">{hat?.hat_name||detail?.title||hat?.hat_title}</Item>
        <Item label="Card ID / job reference"><span className="select-all break-all font-mono text-[11px]">{job.reference||detail?.reference||hat?.id}</span></Item>
        <Item label="Listing status">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${(job.is_open ?? detail?.is_open ?? (hat?.active && hat?.availability)) ? 'bg-green-100 text-green-800':'bg-slate-100 text-slate-600'}`}>
            {(job.is_open ?? detail?.is_open ?? (hat?.active && hat?.availability)) ? 'Open for applications / booking':'Closed'}
          </span>
        </Item>
        <Item label="Job type">{[type,duration].filter(Boolean).join(' · ')}</Item>
        <Item label="Hat Location">{jobLocation}</Item>
        <Item label="Price / budget">{price}</Item>
        <Item label="Available">{hat?.available_days ? formatAvailabilityWindow(hat) : null}</Item>
        {(hat?.role==='talent'||profile.role==='talent') ? <>
          <Item label="Bookings for this Hat">{job.bookings ?? 'Not available'}</Item>
          <Item label="Funded active bookings">{job.active_bookings ?? 'Not available'}</Item>
        </> : <>
          <Item label="People applied for this Hat">{job.applicants ?? 'Not available'}</Item>
          <Item label="Pending / accepted applications">{job.active_applicants ?? 'Not available'}</Item>
        </>}
      </dl>
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-black/45">
          {hat?.role==='client'||profile.role==='client'?'Job requirements':'About this service'}
        </h4>
        <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-black/80">
          {requirements || 'The owner has not provided detailed requirements for this Hat yet.'}
        </p>
      </div>
      {(detail?.tagline||hat?.motto)&&<p className="text-[11px] italic text-black/45">
        Tagline: {detail?.tagline||hat?.motto}
      </p>}
    </section>}
  </div>
}
