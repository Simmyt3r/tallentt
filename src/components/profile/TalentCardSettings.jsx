import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { talentGroups } from '../../lib/talentCard.js'

export default function TalentCardSettings({ username, value, onChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    api.getUserProfile(username).then(result => { if (alive) setData(result) })
      .catch(() => { if (alive) setError('Could not load your talents and portfolio. Reopen Edit profile to try again.') })
    return () => { alive = false }
  }, [username])
  const update = patch => onChange({ ...value, ...patch })
  const salary = value.salary || { visibility: 'private', tier: '', min: '', max: '' }
  const changeSalary = patch => update({salary: {...salary, ...patch}})
  const featured = value.featuredMedia || []
  return <fieldset className="space-y-4 rounded-2xl border border-black/10 p-4">
    <legend className="px-1 text-sm font-bold">Talent Card</legend>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <label className="block text-xs font-semibold">Main talent
      <select className="tw-input mt-2" value={value.mainTalent || ''} disabled={!data} onChange={e => update({mainTalent: e.target.value})}>
        <option value="">No main talent selected</option>
        {value.mainTalent && !talentGroups(data?.hats?.talent).includes(value.mainTalent) && <option value={value.mainTalent}>{value.mainTalent} (no active Hat)</option>}
        {talentGroups(data?.hats?.talent).map(name => <option key={name}>{name}</option>)}
      </select>
    </label>
    <p className="text-xs text-black/50">Talents come from your active Talent Hat categories. Your main talent appears first.</p>
    <fieldset><legend className="mb-2 text-xs font-semibold">Open to</legend><div className="flex gap-4">
      {['Gigs', 'Full-time'].map(mode => <label key={mode} className="flex gap-2 text-sm"><input type="checkbox" checked={(value.workModes || []).includes(mode)} onChange={e => update({workModes: e.target.checked ? [...(value.workModes || []), mode] : value.workModes.filter(m => m !== mode)})}/>{mode}</label>)}
    </div></fieldset>
    <label className="block text-xs font-semibold">Availability (self-reported)
      <select className="tw-input mt-2" value={value.availability || 'not-specified'} onChange={e => update({availability: e.target.value})}>
        <option value="not-specified">Not specified</option><option value="available">Available now</option><option value="busy">Currently busy</option><option value="not-looking">Not looking for work</option>
      </select>
    </label>
    <label className="block text-xs font-semibold">Salary expectation visibility
      <select className="tw-input mt-2" value={salary.visibility} onChange={e => changeSalary({visibility: e.target.value})}>
        <option value="private">Private — ask me</option><option value="tier">Show tier only</option><option value="range">Show expected range</option>
      </select>
    </label>
    <label className="block text-xs font-semibold">Experience tier
      <select className="tw-input mt-2" value={salary.tier || ''} onChange={e => changeSalary({tier: e.target.value})}>
        <option value="">Choose a tier</option>{['Entry','Mid','Senior','Top'].map(tier => <option key={tier}>{tier}</option>)}
      </select>
    </label>
    <div className="grid grid-cols-2 gap-3">{['min', 'max'].map(key => <label key={key} className="text-xs font-semibold">{key === 'min' ? 'Minimum' : 'Maximum'} NGN/month
      <input className="tw-input mt-2" type="number" min="1" max="2000000000" step="1" value={salary[key] ?? ''} onChange={e => changeSalary({[key]: e.target.value})}/>
    </label>)}</div>
    <p className="text-xs text-black/50">An expectation, not an agreed salary. Amounts stay private unless you choose “Show expected range”.</p>
    <fieldset className="space-y-2"><legend className="text-xs font-semibold">Featured works ({featured.length}/3)</legend>
      <p className="text-xs text-black/50">Choose your best three for All. Empty places use your newest work.</p>
      {!data && !error && <p className="text-xs">Loading portfolio…</p>}
      {data?.portfolio?.length === 0 && <p className="text-xs text-black/50">Add images or videos to a Talent Hat first.</p>}
      <div className="max-h-52 space-y-2 overflow-y-auto">{(data?.portfolio || []).map((item, index) => <label key={item.id} className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={featured.includes(item.id)} disabled={!featured.includes(item.id) && featured.length >= 3} onChange={e => update({featuredMedia: e.target.checked ? [...featured, item.id] : featured.filter(id => id !== item.id)})}/>
        <span>{item.caption || item.hat_title || 'Portfolio work'} · {item.type} · {index + 1}</span>
      </label>)}</div>
      {featured.some(id => data && !data.portfolio?.some(item => item.id === id)) && <button type="button" className="text-xs text-blue-700 underline" onClick={() => update({featuredMedia: featured.filter(id => data?.portfolio?.some(item => item.id === id))})}>Remove unavailable featured works</button>}
    </fieldset>
  </fieldset>
}
