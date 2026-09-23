export default function RoleCardBadge({ role, className = '' }) {
  const normalized = role === 'talent' || role === 'client' ? role : null
  if (!normalized) return null

  const isTalent = normalized === 'talent'
  const label = isTalent ? 'Talent' : 'Client'

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border-[1.5px] border-black shadow-[3px_3px_0_rgba(245,243,239,0.9)] ${isTalent ? 'bg-[#0A13E6] text-white' : 'bg-black text-white'} ${className}`}
    >
      <span className="text-[17px] leading-none font-black italic tracking-[-0.08em] -translate-x-[1px]">
        {isTalent ? 'T' : 'C'}
      </span>
    </span>
  )
}
