import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, PenSquare, Search } from 'lucide-react'
import { api } from '../lib/api.js'
import { BookingThread } from './Messages.jsx'
import { AssociateThread, NewAssociateChat } from './CommunityChats.jsx'
import { EmploymentThread, NewEmployment } from './Employment.jsx'
import InboxConversationRow from '../components/InboxConversationRow.jsx'
import {consolidateInbox,chatLabel} from '../lib/inboxConsolidation.js'

export default function Inbox() {
  const [employment,setEmployment]=useState([])
  const [params, setParams] = useSearchParams()
  const [deals, setDeals] = useState([]),
    [associates, setAssociates] = useState([]),
    [cursor, setCursor] = useState(null)
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [paging, setPaging] = useState(false),
    [searchOpen,setSearchOpen] = useState(false)
  const alive = useRef(true),
    initialized = useRef(false),
    hidden = useRef(new Set())
  const escrow = params.get('escrow'),
    thread = params.get('thread'),
    employmentId = params.get('employment'),
    personId = params.get('person'),
    hiring = params.has('hire'),
    compose = params.get('compose') === '1',
    active = Boolean(escrow || thread || compose || employmentId || hiring || personId)
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api.getConversations(),
      api.getCommunityChats(),
      api.getEmploymentChats(),
    ])
    if (!alive.current) return
    const [bento, community] = results
    if(results[2].status==='fulfilled'){
      setEmployment((results[2].value.threads||[]).filter(x=>!hidden.current.has('employment:'+x.id)))
    }
    if (bento.status === 'fulfilled') {
      const visible=(bento.value.conversations||[]).filter(x=>!hidden.current.has('bento:'+x.id))
      setDeals((old) => [
        ...visible,
        ...old.filter(item=>!hidden.current.has('bento:'+item.id)&&!visible.some(next=>next.id===item.id)),
      ])
      if (!initialized.current) {
        setCursor(bento.value.nextCursor)
        initialized.current = true
      }
    }
    if (community.status === 'fulfilled')
      setAssociates((community.value.threads||[]).filter(x=>!hidden.current.has('associates:'+x.id)))
    setError(
      results
        .filter((r) => r.status === 'rejected')
        .map((r) => r.reason.message)
        .join(' · '),
    )
    setLoading(false)
  }, [])
  useEffect(() => {
    alive.current = true
    let stopped = false,
      timer
    const poll = async () => {
      if (!document.hidden) await refresh()
      if (!stopped) timer = setTimeout(poll, 15000)
    }
    poll()
    window.addEventListener('inbox:read', refresh)
    return () => {
      alive.current = false
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('inbox:read', refresh)
    }
  }, [refresh])
  const open = (kind, id) =>
    setParams(kind === 'bento' ? { escrow: id } : kind === 'employment' ? {employment:id} : { thread: id })
  async function more() {
    setPaging(true)
    try {
      const data = await api.getConversations(cursor)
      setDeals((old) => [
        ...old,
        ...data.conversations.filter(item=>!hidden.current.has('bento:'+item.id)&&!old.some(x=>x.id===item.id)),
      ])
      setCursor(data.nextCursor)
    } catch (e) {
      setError(e.message)
    } finally {
      setPaging(false)
    }
  }
  async function remove(item){
    const count=item.threads.length
    const name=item.name||'this subscriber'
    if(!window.confirm('Remove '+(count>1?'all '+count+' chats':'this chat')+' with '+name+' from your inbox? There is no Trash or Restore. Work and payment records remain intact.'))return
    const attempts=await Promise.allSettled(item.threads.map(async entry=>{
      if(entry.kind==='bento')await api.hideConversation(entry.id)
      else await api.hideInboxThread(entry.kind,entry.id)
      hidden.current.add(entry.kind+':'+entry.id)
    }))
    const failed=attempts.filter(x=>x.status==='rejected')
    setDeals(old=>old.filter(x=>!hidden.current.has('bento:'+x.id)))
    setAssociates(old=>old.filter(x=>!hidden.current.has('associates:'+x.id)))
    setEmployment(old=>old.filter(x=>!hidden.current.has('employment:'+x.id)))
    if(failed.length)setError(failed.map(x=>x.reason?.message||'Could not remove chat.').join(' · '))
    else setError('')
    if(item.threads.some(t=>t.id===escrow||t.id===thread||t.id===employmentId))setParams({})
    window.dispatchEvent(new Event('inbox:read'))
  }
  const allThreads = [
    ...employment.map(x=>({...x,kind:'employment',name:x.peer_name||x.peer_username})),
    ...deals.map((x) => ({
      ...x,
      kind: 'bento',
      name: x.peer_full_name || x.peer_username,
    })),
    ...associates.map((x) => ({
      ...x,
      kind: 'associates',
      name: x.peer_name || x.peer_username,
    })),
  ]
  // Single account identity in the list, regardless of how many independent
  // work, employment and Associate threads exist with this person.
  const everyone=consolidateInbox(allThreads)
  const items=consolidateInbox(allThreads.filter(x=>
    (filter==='all'||(filter==='unread'&&Number(x.unread_count)>0)||filter===x.kind)
    &&[x.name,x.peer_username,x.hat_title,x.last_message].some(value=>
      String(value||'').toLowerCase().includes(search.trim().toLowerCase()))
  ))
  const activePerson=everyone.find(person=>person.threads.some(t=>
    t.kind==='bento'?t.id===escrow:t.kind==='employment'?t.id===employmentId:t.id===thread))
  // Old ?person links stay valid; the user does not see a second chooser.
  useEffect(()=>{
    if(!personId||loading)return
    const person=everyone.find(item=>item.id===personId)
    const latest=person?.threads?.[0]
    if(latest)open(latest.kind,latest.id)
    else setParams({})
  },[personId,loading,employment.length,deals.length,associates.length])
  const returnToList=()=>{setParams({});refresh()}
  return (
    <main className="-mx-4 max-w-6xl md:mx-auto md:py-3">
      <div className="grid h-[calc(100dvh-136px)] min-h-[420px] overflow-hidden bg-white md:grid-cols-[340px_minmax(0,1fr)] md:h-[calc(100dvh-130px)]">
        <aside
          aria-label="Conversations"
          className={`${active ? 'hidden md:flex' : 'flex'} min-h-0 flex-col md:border-r md:border-black/10`}
        >
          <header className="flex items-center justify-between px-5 pt-5">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Chats</h1>
              <p className="mt-1 text-xs text-black/45">
                Your people. Your work. One inbox.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label={searchOpen?'Close conversation search':'Search conversations'}
                aria-expanded={searchOpen} onClick={()=>{setSearchOpen(open=>!open);setSearch('')}}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><Search size={19}/></button>
              <button type="button" onClick={()=>setParams({compose:'1'})} aria-label="New message"
                title="New message" className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-[#0A13E6]">
                <PenSquare size={19}/>
              </button>
            </div>
          </header>
          {searchOpen&&<label className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-[#F4F5F7] px-3">
            <Search size={17} className="shrink-0 text-black/40"/>
            <input autoFocus aria-label="Search messages and people" value={search}
              onChange={e=>setSearch(e.target.value)} placeholder="Search messages and people"
              className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none"/>
          </label>}
          <div
            className="flex flex-wrap gap-1 px-4 py-3"
            aria-label="Filter conversations"
          >
            {[
              ['all', 'All'],
              ['unread', 'Unread'],
              ['bento', 'Bento'],
              ['associates', 'Associates'],
              ['employment','Employment'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-2 text-[11px] font-semibold ${filter === key ? 'bg-blue-50 text-[#0A13E6]' : 'text-black/50 hover:bg-black/5'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <div
              role="alert"
              className="mx-3 rounded-xl bg-red-50 p-3 text-xs text-red-700"
            >
              {error}{' '}
              <button type="button" onClick={refresh} className="underline">
                Retry
              </button>
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto pb-3">
            {loading && (
              <li className="p-5 text-sm text-black/50">
                Loading conversations…
              </li>
            )}
            {!loading && !items.length && (
              <li className="p-5 text-sm text-black/50">
                {search || filter !== 'all'
                  ? 'No matching conversations.'
                  : 'Your conversations will appear here. Start a chat with an Associate or book work from Bento.'}
              </li>
            )}
            {items.map(item=><InboxConversationRow key={item.id} item={item}
              selected={item.threads.some(t=>t.kind==='bento'?escrow===t.id:t.kind==='employment'?employmentId===t.id:thread===t.id)}
              onOpen={()=>{const latest=item.threads[0];if(latest)open(latest.kind,latest.id)}}
              onRemove={remove}/>)}
          </ul>
          {cursor && (
            <button
              type="button"
              disabled={paging}
              onClick={more}
              className="border-t p-3 text-xs font-semibold"
            >
              {paging ? 'Loading…' : 'Load more conversations'}
            </button>
          )}
        </aside>
        <div
          className={`${active ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col [&>section]:flex-1`}
        >
          {activePerson?.threads.length>1&&<nav aria-label="Chats with this subscriber"
            className="flex shrink-0 gap-2 overflow-x-auto border-b border-black/10 bg-[#FAFAF8] px-3 py-2">
            {activePerson.threads.map(entry=><button type="button" key={entry.kind+':'+entry.id}
              onClick={()=>open(entry.kind,entry.id)}
              aria-current={(entry.kind==='bento'&&entry.id===escrow)||(entry.kind==='employment'&&entry.id===employmentId)||(entry.kind==='associates'&&entry.id===thread)?'page':undefined}
              className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-bold ${(entry.kind==='bento'&&entry.id===escrow)||(entry.kind==='employment'&&entry.id===employmentId)||(entry.kind==='associates'&&entry.id===thread)?'bg-[#0A13E6] text-white':'bg-white text-black/60'}`}>
              {chatLabel(entry)}
            </button>)}
          </nav>}
          {hiring ? <NewEmployment key={params.get('hire')||'new-hire'} username={params.get('hire')||''} onBack={()=>setParams({})} onOpen={id=>{open('employment',id);refresh()}}/> : employmentId ? <EmploymentThread key={employmentId} id={employmentId} onBack={returnToList} onChange={refresh} initialTab="chat"/> : compose ? (
            <NewAssociateChat
              onBack={() => setParams({})}
              onOpen={(id) => {
                open('associates', id)
                refresh()
              }}
            />
          ) : escrow ? (
            <BookingThread
              key={'bento' + escrow}
              id={escrow}
              onBack={returnToList}
            />
          ) : thread ? (
            <AssociateThread
              key={'associate' + thread}
              id={thread}
              onBack={returnToList}
              onChange={refresh}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-blue-50 text-[#0A13E6]">
                <MessageCircle size={38} />
              </span>
              <h2 className="text-xl font-bold">A conversation starts here</h2>
              <p className="mt-2 max-w-xs text-sm text-black/45">
                Catch up with Associates and keep work moving with Bento, all in
                one place.
              </p>
              <button
                type="button"
                onClick={() => setParams({ compose: '1' })}
                className="mt-6 rounded-full bg-[#0A13E6] px-5 py-3 text-sm font-semibold text-white"
              >
                New message
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
