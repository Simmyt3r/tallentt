import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, UsersRound } from 'lucide-react'
import CompactPageHeader from '../components/CompactPageHeader.jsx'
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
    <CompactPageHeader title="Inbox" searchValue={terms[tab]}
      onSearchChange={value=>setTerms(current=>({...current,[tab]:value}))}
      searchPlaceholder={tab==='bento'?'Search jobs and people…':'Search associates and conversations…'}
      searchLabel={`Search in ${tab === 'bento' ? 'Bento Chat' : 'Associates Chat'}`}/>
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Inbox lanes">
      <button id="inbox-bento-tab" type="button" role="tab" aria-selected={tab==='bento'}
        onClick={() => changeTab('bento')}
        className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold ${tab==='bento'?'bg-[#087C50] text-white':'border border-black/15 bg-white'}`}>
        <BriefcaseBusiness size={16}/> Bento Chat
      </button>
      <button id="inbox-associates-tab" type="button" role="tab" aria-selected={tab==='associates'}
        onClick={() => changeTab('associates')}
        className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold ${tab==='associates'?'bg-[#0A13E6] text-white':'border border-black/15 bg-white'}`}>
        <UsersRound size={16}/> Associates Chat
      </button>
    </div>
    <section role="tabpanel" aria-labelledby={tab==='bento'?'inbox-bento-tab':'inbox-associates-tab'}>
      {tab==='bento'
        ? <Messages embedded searchText={terms.bento}/>
        : <CommunityChats embedded searchText={terms.associates}/>}
    </section>
  </main>
}
