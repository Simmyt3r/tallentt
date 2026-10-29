import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, PenSquare, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { BookingThread } from './Messages.jsx'
import { AssociateThread, NewAssociateChat } from './CommunityChats.jsx'
import { EmploymentThread, NewEmployment } from './Employment.jsx'
import {useAuth} from '../context/AuthContext.jsx'

export default function Inbox() {
  const {user}=useAuth()
  const [employment,setEmployment]=useState([])
  const [employmentAvailable,setEmploymentAvailable]=useState(false)
  const [params, setParams] = useSearchParams()
  const [deals, setDeals] = useState([]),
    [associates, setAssociates] = useState([]),
    [cursor, setCursor] = useState(null)
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [paging, setPaging] = useState(false)
  const alive = useRef(true),
    initialized = useRef(false)
  const escrow = params.get('escrow'),
    thread = params.get('thread'),
    employmentId = params.get('employment'),
    hiring = params.has('hire'),
    compose = params.get('compose') === '1',
    active = Boolean(escrow || thread || compose || employmentId || hiring)
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api.getConversations(),
      api.getCommunityChats(),
      api.getEmploymentChats(),
    ])
    if (!alive.current) return
    const [bento, community] = results
    if(results[2].status==='fulfilled'){
      setEmployment(results[2].value.threads||[])
      setEmploymentAvailable(results[2].value.available===true)
    }
    if (bento.status === 'fulfilled') {
      setDeals((old) => [
        ...bento.value.conversations,
        ...old.filter(
          (item) =>
            !bento.value.conversations.some((next) => next.id === item.id),
        ),
      ])
      if (!initialized.current) {
        setCursor(bento.value.nextCursor)
        initialized.current = true
      }
    }
    if (community.status === 'fulfilled')
      setAssociates(community.value.threads || [])
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
        ...data.conversations.filter(
          (item) => !old.some((x) => x.id === item.id),
        ),
      ])
      setCursor(data.nextCursor)
    } catch (e) {
      setError(e.message)
    } finally {
      setPaging(false)
    }
  }
  async function remove(item) {
    if (
      !window.confirm(
        'Remove this chat from your inbox? The deal and its records remain in My Deals.',
      )
    )
      return
    try {
      await api.hideConversation(item.id)
      setDeals((old) => old.filter((x) => x.id !== item.id))
      if (escrow === item.id) setParams({})
    } catch (e) {
      setError(e.message)
    }
  }
  const items = [
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
    .filter(
      (x) =>
        (filter === 'all' ||
          (filter === 'unread' && Number(x.unread_count) > 0) ||
          filter === x.kind) &&
        [x.name, x.peer_username, x.hat_title, x.last_message].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        ),
    )
    .sort(
      (a, b) =>
        new Date(b.last_at || b.updated_at || b.created_at) -
        new Date(a.last_at || a.updated_at || a.created_at),
    )
  return (
    <main className="mx-auto max-w-6xl py-3">
      <div className="grid h-[calc(100dvh-150px)] min-h-[420px] overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm md:grid-cols-[320px_minmax(0,1fr)] md:h-[calc(100dvh-130px)]">
        <aside
          aria-label="Conversations"
          className={`${active ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-black/10`}
        >
          <header className="flex items-center justify-between px-5 pt-5">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Chats</h1>
              <p className="mt-1 text-xs text-black/45">
                Your people. Your work. One inbox.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setParams({ compose: '1' })}
              aria-label="New message"
              title="New message"
              className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-[#0A13E6]"
            >
              <PenSquare size={19} />
            </button>
          </header>
          {employmentAvailable&&['client','dual'].includes(user?.role)&&<button type="button" className="mx-4 mt-3 rounded-xl border border-blue-100 p-2 text-xs font-bold text-[#0A13E6]" onClick={()=>setParams({hire:''})}>Hire full-time</button>}
          <label className="mx-4 mt-5 flex items-center gap-2 rounded-full bg-[#F4F5F7] px-3">
            <Search size={17} className="text-black/40" />
            <input
              aria-label="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages and people"
              className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none"
            />
          </label>
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
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
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
            {items.map((item) => {
              const selected =
                item.kind === 'bento' ? escrow === item.id : item.kind === 'employment' ? employmentId === item.id : thread === item.id
              return (
                <li
                  key={item.kind + item.id}
                  className={`group relative rounded-2xl ${selected ? 'bg-blue-50' : 'hover:bg-black/[0.03]'}`}
                >
                  <button
                    type="button"
                    onClick={() => open(item.kind, item.id)}
                    aria-current={selected ? 'page' : undefined}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#EEEFFC] text-lg font-bold text-[#0A13E6]">
                      {item.peer_avatar ? (
                        <img
                          src={item.peer_avatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        String(item.name || '?')
                          .slice(0, 1)
                          .toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong className="flex-1 truncate text-sm">
                          {item.name || 'Conversation'}
                        </strong>
                        {Number(item.unread_count) > 0 && (
                          <span
                            aria-label={`${item.unread_count} unread`}
                            className="rounded-full bg-[#0A13E6] px-1.5 py-0.5 text-[10px] text-white"
                          >
                            {item.unread_count}
                          </span>
                        )}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-xs ${Number(item.unread_count) > 0 ? 'font-semibold text-black/80' : 'text-black/45'}`}
                      >
                        {item.last_message || item.hat_title || 'Chat request'}
                      </span>
                      <span className="mt-1 flex gap-2 text-[10px] text-black/40">
                        <span className="min-w-0 truncate">
                          {item.kind === 'bento'
                            ? 'Bento · ' + item.hat_title
                            : item.kind==='employment' ? 'Employment · '+item.hat_title : 'Associate'}
                        </span>
                        {item.last_at && (
                          <time className="ml-auto shrink-0">
                            {new Date(item.last_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                        )}
                      </span>
                    </span>
                  </button>
                  {item.kind === 'bento' && (
                    <button
                      type="button"
                      aria-label={`Remove chat about ${item.hat_title}`}
                      title="Remove from inbox"
                      onClick={() => remove(item)}
                      className="absolute bottom-1 right-2 rounded-full bg-white p-1.5 text-black/40 opacity-100 md:opacity-0 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </li>
              )
            })}
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
          {hiring ? <NewEmployment key={params.get('hire')||'new-hire'} username={params.get('hire')||''} onBack={()=>setParams({})} onOpen={id=>{open('employment',id);refresh()}}/> : employmentId ? <EmploymentThread key={employmentId} id={employmentId} onBack={()=>{setParams({});refresh()}} onChange={refresh}/> : compose ? (
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
              onBack={() => {
                setParams({})
                refresh()
              }}
            />
          ) : thread ? (
            <AssociateThread
              key={'associate' + thread}
              id={thread}
              onBack={() => {
                setParams({})
                refresh()
              }}
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
