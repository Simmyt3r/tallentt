import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefcaseBusiness, UsersRound, X } from 'lucide-react'
import { api } from '../lib/api.js'
import {consolidateInbox} from '../lib/inboxConsolidation.js'

// A lightweight chooser before entering the one unified inbox.
// It never mixes deal and networking threads, even in its recent previews.
export default function InboxChooser({ open, onClose, preferred = 'associates' }) {
  const [recent, setRecent] = useState({ bento: [], associates: [] })
  useEffect(() => {
    if (!open) return undefined
    let active = true
    Promise.allSettled([api.getConversations(), api.getCommunityChats()]).then(results => {
      if (!active) return
      setRecent({
        bento: results[0].status === 'fulfilled' ? (results[0].value.conversations || []).slice(0, 3) : [],
        associates: results[1].status === 'fulfilled' ? (results[1].value.threads || []).slice(0, 3) : [],
      })
    })
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { active = false; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  const choices = [
    { lane: 'bento', title: 'Bento Chat', subtitle: 'Hire, work, payment and dispute records', icon: BriefcaseBusiness },
    { lane: 'associates', title: 'Associates Chat', subtitle: 'Professional networks and collaboration', icon: UsersRound },
  ].sort((a,b)=>a.lane===preferred?-1:b.lane===preferred?1:0)

  const people=consolidateInbox([
    ...recent.bento.map(t=>({...t,kind:'bento',name:t.peer_full_name||t.peer_username})),
    ...recent.associates.map(t=>({...t,kind:'associates',name:t.peer_name||t.peer_username})),
  ]).slice(0,6)
  return <div role="presentation" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="inbox-chooser-heading"
      className="w-full max-w-md rounded-t-3xl border border-black/10 bg-white p-5 shadow-2xl sm:rounded-3xl"
      onClick={event=>event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h2 id="inbox-chooser-heading" className="text-[17px] font-black">Chat about?</h2>
        <button type="button" aria-label="Close Inbox chooser" onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><X size={19}/></button>
      </div>
      <div className="mt-3 space-y-2">
        {choices.map(({lane,title,subtitle,icon:Icon})=>
          <Link key={lane} to={`/inbox?tab=${lane}`} onClick={onClose}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-black/15 p-3 hover:bg-[#F7F3EB]">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${lane==='bento'?'bg-[#087C50]':'bg-[#0A13E6]'}`}><Icon size={19}/></span>
            <span><strong className="block text-[13px]">{title}</strong><span className="text-[11px] text-black/55">{subtitle}</span></span>
          </Link>)}
      </div>
      {people.length>0&&<div className="mt-4 border-t border-black/10 pt-3">
        <p className="mb-2 text-[11px] font-black text-black/55">Recent people</p>
        {people.map(person=><Link key={person.id} onClick={onClose}
          to={'/inbox?person='+encodeURIComponent(person.id)}
          className="flex justify-between gap-3 rounded-xl px-2 py-2 text-[12px] hover:bg-black/5">
          <span className="truncate font-semibold">{person.name||person.peer_username}</span>
          <span className="shrink-0 text-black/50">{person.threads.length} {person.threads.length===1?'chat':'chats'}</span>
        </Link>)}
      </div>}
    </section>
  </div>
}
