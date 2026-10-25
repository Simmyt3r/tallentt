import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, UsersRound, Search } from 'lucide-react'
import Messages from './Messages.jsx'
import CommunityChats from './CommunityChats.jsx'

const activeLane = (value) => value === 'bento' ? 'bento' : 'associates'

export default function Inbox() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [tab, setTab] = useState(() => activeLane(params.get('tab') ||
    (location.state?.inboxContext === 'bento' ? 'bento' : 'associates')))
  const [terms, setTerms] = useState({ bento: '', associates: '' })

  useEffect(() => {
    const explicit = params.get('tab')
    if (explicit === 'bento' || explicit === 'associates') setTab(explicit)
  }, [params])

  function changeTab(value) {
    setTab(value)
    // Keep the two message systems and their identifiers strictly separate.
    setParams({ tab: value })
  }

  return <main className="mx-auto max-w-6xl space-y-4 pb-10">
    <header className="sticky top-14 z-10 border-b border-black/10 bg-[#F7F3EB]/95 py-3 backdrop-blur md:top-16">
      <h1 className="text-[21px] font-black">Inbox</h1>
      <p className="text-[12px] text-black/55">One inbox, two separate kinds of conversations. Hiring payments stay inside Bento Chat.</p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Inbox lanes">
        <button id="inbox-bento-tab" type="button" role="tab" aria-selected={tab==='bento'}
          onClick={() => changeTab('bento')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold ${tab==='bento'?'bg-[#087C50] text-white':'border border-black/15 bg-white'}`}>
          <BriefcaseBusiness size={16}/> Bento Chat
        </button>
        <button id="inbox-associates-tab" type="button" role="tab" aria-selected={tab==='associates'}
          onClick={() => changeTab('associates')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold ${tab==='associates'?'bg-[#0A13E6] text-white':'border border-black/15 bg-white'}`}>
          <UsersRound size={16}/> Associates Chat
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-black/60">Search in</span>
        <button type="button" aria-pressed={tab==='bento'} onClick={()=>changeTab('bento')}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${tab==='bento'?'bg-green-50 border-green-700 text-green-800':'border-black/15 bg-white'}`}>Bento Chat</button>
        <button type="button" aria-pressed={tab==='associates'} onClick={()=>changeTab('associates')}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${tab==='associates'?'bg-blue-50 border-blue-700 text-blue-800':'border-black/15 bg-white'}`}>Associates Chat</button>
      </div>
      <label className="mt-2 flex items-center gap-2 rounded-full border border-black/20 bg-white px-3 py-2">
        <Search aria-hidden size={17} className="text-black/45"/>
        <input type="search" aria-label={`Search in ${tab === 'bento' ? 'Bento Chat' : 'Associates Chat'}`}
          value={terms[tab]} onChange={e=>setTerms(v=>({...v,[tab]:e.target.value}))}
          placeholder={tab==='bento'?'Search jobs and people…':'Search associates and conversations…'}
          className="w-full min-w-0 bg-transparent text-[13px] outline-none"/>
      </label>
    </header>
    <section role="tabpanel" aria-labelledby={tab==='bento'?'inbox-bento-tab':'inbox-associates-tab'}>
      {tab==='bento'
        ? <Messages embedded searchText={terms.bento}/>
        : <CommunityChats embedded searchText={terms.associates}/>}
    </section>
  </main>
}
