import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import UserIdentity from './UserIdentity.jsx'

function PartyCard({ user, role, isCurrent, compact }) {
  return (
    <div className="min-w-0 flex-1 rounded-[14px] border border-black/10 bg-white px-2.5 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${
            role === 'client'
              ? 'bg-black text-white'
              : 'bg-[#0A13E6] text-white'
          }`}
        >
          {role === 'client' ? 'Client' : 'Talent'}
        </span>
        {isCurrent && (
          <span className="text-[9px] font-black uppercase tracking-[0.08em] text-black/35">
            You
          </span>
        )}
      </div>

      <UserIdentity
        user={user}
        align="start"
        gap="gap-2"
        avatarClassName={compact ? 'w-8 h-8' : 'w-12 h-12'}
        nameClassName="text-[11px] font-black"
        usernameClassName="text-[9.5px] font-semibold text-black/45"
      />
    </div>
  )
}

export default function NegotiationParties({
  currentUser,
  peer,
  currentRole,
  compact = false,
}) {
  const [swapped, setSwapped] = useState(false)

  const client = currentRole === 'client' ? currentUser : peer
  const talent = currentRole === 'talent' ? currentUser : peer

  const clientParty = {
    key: 'client',
    role: 'client',
    user: client,
    isCurrent: currentRole === 'client',
  }
  const talentParty = {
    key: 'talent',
    role: 'talent',
    user: talent,
    isCurrent: currentRole === 'talent',
  }

  const parties = swapped ? [talentParty, clientParty] : [clientParty, talentParty]

  return (
    <div className={compact ? '' : 'mt-3'}>
      <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center gap-2">
        <PartyCard {...parties[0]} compact={compact} />

        <button
          type="button"
          onClick={() => setSwapped((value) => !value)}
          aria-label="Switch negotiation sides"
          title="Switch negotiation sides"
          className="h-9 w-9 rounded-full border-[1.5px] border-black bg-[#F7F3EB] grid place-items-center transition hover:bg-black hover:text-white active:scale-95"
        >
          <ArrowLeftRight size={15} />
        </button>

        <PartyCard {...parties[1]} compact={compact} />
      </div>

      {!compact && (
        <p className="mt-1.5 text-center text-[9px] font-semibold text-black/35">
          Use the arrows to switch the visual sides.
        </p>
      )}
    </div>
  )
}
