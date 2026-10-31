import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Clock, Handshake, History, LayoutGrid, List, Search, Undo2, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'
import RoleCardBadge from '../components/RoleCardBadge.jsx'

function money(value, currency = 'NGN') {
  if (value == null) return '—'
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
  } catch {
    return `₦${Number(value).toLocaleString()}`
  }
}

function niceStatus(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function peerFor(item, role, isApplication) {
  const prefix = isApplication
    ? role === 'talent' ? 'owner' : 'applicant'
    : role === 'talent' ? 'client' : 'talent'
  return {
    username: item[`${prefix}_username`],
    name: item[`${prefix}_full_name`],
    avatar: item[`${prefix}_avatar`],
    lga: item[`${prefix}_lga`] || item.hat_lga,
    role: prefix === 'client' || prefix === 'owner' ? 'client' : 'talent',
  }
}

function Skeletons() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="h-[190px] animate-pulse rounded-[20px] border border-black/10 bg-white p-4">
          <div className="h-12 w-12 rounded-[13px] bg-black/[0.06]" />
          <div className="mt-3 h-4 w-1/2 rounded bg-black/[0.08]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-black/[0.05]" />
        </div>
      ))}
    </div>
  )
}

export default function MyDeals() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const savedRole = localStorage.getItem('_role') || localStorage.getItem('chombutar_role')
  const initialRole = ['talent', 'client'].includes(params.get('role'))
    ? params.get('role')
    : ['talent', 'client'].includes(savedRole) ? savedRole : 'talent'
  const initialTab = ['incoming', 'outgoing', 'active', 'history'].includes(params.get('tab'))
    ? params.get('tab')
    : 'incoming'

  const role = ['talent', 'client'].includes(params.get('role')) ? params.get('role') : initialRole
  const tab = ['incoming', 'outgoing', 'active', 'history'].includes(params.get('tab')) ? params.get('tab') : initialTab

  const [items, setItems] = useState([])
  const [search,setSearch]=useState('')
  const [searchOpen,setSearchOpen]=useState(false)
  const [expandedApplication,setExpandedApplication]=useState(null)
  const [viewMode,setViewMode]=useState(()=>{try{return localStorage.getItem('chombutar_deals_view')==='list'?'list':'grid'}catch{return 'grid'}})
  useEffect(()=>{try{localStorage.setItem('chombutar_deals_view',viewMode)}catch{}},[viewMode])
  const [counts, setCounts] = useState({ incoming: 0, outgoing: 0, active: 0, history: 0 })
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [quietLoading, setQuietLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const undoTimer = useRef(null)
  // A slow response from a previous role/tab must never replace the current
  // tab's cards or counts, especially when realtime refreshes overlap.
  const viewKey = `${user?.id || ''}:${role}:${tab}`
  const currentViewRef = useRef(viewKey)
  currentViewRef.current = viewKey
  const requestSequence = useRef(0)

  const setView = useCallback((nextRole, nextTab) => {
    const next = new URLSearchParams(params)
    next.set('role', nextRole)
    next.set('tab', nextTab)
    setParams(next, { replace: false })
  }, [params, setParams])

  const load = useCallback(async ({ quiet = false } = {}) => {
    const sequence = ++requestSequence.current
    const requestedView = viewKey
    if (quiet) setQuietLoading(true)
    else setLoading(true)
    try {
      const data = await api.getMyDealsPage(role, tab)
      if (sequence !== requestSequence.current || currentViewRef.current !== requestedView) return
      setItems(data.items || [])
      setCounts(data.counts || {})
      setNextCursor(data.nextCursor || null)
      setError('')
    } catch (err) {
      if (sequence === requestSequence.current && currentViewRef.current === requestedView) {
        setError(err.message || 'Could not load your deals.')
      }
    } finally {
      if (sequence === requestSequence.current && currentViewRef.current === requestedView) {
        setLoading(false)
        setQuietLoading(false)
      }
    }
  }, [role, tab, viewKey])

  useEffect(() => {
    if (params.get('role') !== role || params.get('tab') !== tab) {
      setParams({ role, tab }, { replace: true })
    }
  }, [params, role, setParams, tab])

  useEffect(() => {
    localStorage.setItem('_role', role)
    localStorage.setItem('chombutar_role', role)
    window.dispatchEvent(new Event('storage'))
  }, [role])

  useEffect(() => {
    setPaging(false)
    load()
    return () => { requestSequence.current += 1 }
  }, [load])

  useEffect(() => () => clearTimeout(undoTimer.current), [])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, { onChange: () => load({ quiet: true }) })
    return () => connection.close()
  }, [load, user?.id])

  async function loadOlder() {
    if (!nextCursor || paging) return
    const requestedView = viewKey
    const sequence = requestSequence.current
    setPaging(true)
    try {
      const data = await api.getMyDealsPage(role, tab, nextCursor)
      if (sequence !== requestSequence.current || currentViewRef.current !== requestedView) return
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id || item.application_id))
        return [...current, ...(data.items || []).filter((item) => !seen.has(item.id || item.application_id))]
      })
      setCounts(data.counts || counts)
      setNextCursor(data.nextCursor || null)
    } catch (err) {
      if (sequence === requestSequence.current && currentViewRef.current === requestedView) {
        setError(err.message || 'Could not load older deals.')
      }
    } finally {
      if (currentViewRef.current === requestedView) setPaging(false)
    }
  }

  function notifyLocalChange() {
    window.dispatchEvent(new CustomEvent('mydeals:changed'))
  }

  function armUndo(message, undo) {
    clearTimeout(undoTimer.current)
    setToast({ message, undo })
    undoTimer.current = setTimeout(() => setToast(null), 7000)
  }

  // Apply only server-confirmed decisions to the visible list. The slower
  // count/page reconciliation can run afterward without holding the button.
  function confirmListChange(item, destination, requestedView = viewKey) {
    if (currentViewRef.current !== requestedView) return
    const isApplication = Boolean(item.application_id) && !item.id
    const id = isApplication ? item.application_id : item.id
    ++requestSequence.current // Older refreshes must not resurrect the old card.
    setItems((current) => current.filter((entry) =>
      (isApplication ? entry.application_id : entry.id) !== id))
    setCounts((current) => ({
      ...current,
      [tab]: Math.max(0, Number(current[tab] || 0) - 1),
      ...(destination ? { [destination]: Number(current[destination] || 0) + 1 } : {}),
    }))
    setError('')
    void load({ quiet: true })
  }

  async function respond(item, status) {
    const isApplication = Boolean(item.application_id) && !item.id
    const id = isApplication ? item.application_id : item.id
    const requestedView = viewKey
    setBusyId(id)
    setError('')
    try {
      if (isApplication) await api.respondToApplication(item.hat_id, item.application_id, status)
      else await api.respondToBooking(item.id, status)
      confirmListChange(item, status === 'accepted' ? 'active' : !isApplication ? 'history' : null, requestedView)
      notifyLocalChange()
      if (status === 'rejected') {
        armUndo('Deal rejected.', async () => {
          setToast(null)
          setBusyId(id)
          try {
            if (isApplication) await api.respondToApplication(item.hat_id, item.application_id, 'pending')
            else await api.respondToBooking(item.id, 'pending')
            if (currentViewRef.current === requestedView) {
              ++requestSequence.current
              setItems((current) => [item, ...current.filter((entry) =>
                (isApplication ? entry.application_id : entry.id) !== id)])
              setCounts((current) => ({
                ...current,
                [tab]: Number(current[tab] || 0) + 1,
                ...(!isApplication ? { history: Math.max(0, Number(current.history || 0) - 1) } : {}),
              }))
              void load({ quiet: true })
            }
            notifyLocalChange()
          } catch (err) {
            setError(err.message || 'Could not restore this deal.')
          } finally {
            setBusyId(null)
          }
        })
      }
    } catch (err) {
      setError(err.message || 'Could not update this deal.')
    } finally {
      setBusyId(null)
    }
  }

  async function withdrawApplication(item) {
    const requestedView = viewKey
    setBusyId(item.application_id)
    setError('')
    try {
      await api.withdrawApplication(item.hat_id)
      confirmListChange(item, null, requestedView)
      notifyLocalChange()
    } catch (err) {
      setError(err.message || 'Could not withdraw this application.')
    } finally {
      setBusyId(null)
    }
  }

  const visibleItems=useMemo(()=>{
    const needle=search.trim().toLowerCase().replace(/^[@^]+/,'')
    return needle?items.filter(item=>
      [item.hat_title,item.hat_name,item.applicant_username,item.owner_username,
        item.client_username,item.talent_username,item.status,item.message,item.category,
        item.agreed_amount,item.amount].some(v=>String(v??'').toLowerCase().includes(needle))):items
  },[items,search])

  const title = tab === 'history'
    ? 'Deal history'
    : role === 'talent' ? 'Applications' : 'Bookings'

  const subtitle = tab === 'history'
    ? 'Completed, refunded and cancelled deals remain available here.'
    : role === 'talent'
      ? 'Booking requests from clients and applications you sent.'
      : 'Applications from talents and bookings you sent.'

  const empty = tab === 'history'
    ? 'No deal history yet.'
    : tab === 'active'
      ? 'No active deals yet.'
      : role === 'talent' && tab === 'incoming'
        ? 'No incoming bookings yet — your Showroom is live.'
        : role === 'talent'
          ? 'No outgoing applications yet.'
          : tab === 'incoming'
            ? 'No incoming applications yet — your Hiring Hats are live.'
            : 'No outgoing bookings yet.'

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <header className="sticky top-14 md:top-16 z-20 -mx-4 mb-3 border-b border-black/10 bg-[#F7F3EB]/95 px-4 py-3 backdrop-blur-lg md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h1 className="flex min-w-0 items-center gap-2 text-[21px] font-black sm:text-[23px]"><Handshake size={21} aria-hidden="true"/> My Deals</h1>
          <div className="flex shrink-0 items-center gap-1">
            {quietLoading&&<span className="hidden text-[10px] text-black/35 sm:block">Updating…</span>}
            <button type="button" aria-label={searchOpen?'Close deals search':'Search deals'} aria-expanded={searchOpen}
              aria-controls="my-deals-search" onClick={()=>{if(searchOpen)setSearch('');setSearchOpen(v=>!v)}}
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5">{searchOpen?<X size={19}/>:<Search size={19}/>}</button>
            <div role="group" aria-label="My Deals view" className="flex items-center gap-0.5">
              <button type="button" aria-label="Grid view" aria-pressed={viewMode==='grid'}
                onClick={()=>setViewMode('grid')} className={`grid h-11 w-10 place-items-center rounded-lg ${viewMode==='grid'?'bg-[#0A13E6] text-white':'hover:bg-black/5'}`}><LayoutGrid size={18}/></button>
              <button type="button" aria-label="List view" aria-pressed={viewMode==='list'}
                onClick={()=>setViewMode('list')} className={`grid h-11 w-10 place-items-center rounded-lg ${viewMode==='list'?'bg-[#0A13E6] text-white':'hover:bg-black/5'}`}><List size={19}/></button>
            </div>
          </div>
        </div>
        {searchOpen&&<div id="my-deals-search" className="mt-3 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3">
          <Search size={16} className="shrink-0 text-black/45"/>
          <input autoFocus type="text" inputMode="search" value={search} onChange={e=>setSearch(e.target.value)}
            aria-label="Search loaded deal records" placeholder="Search My Deals…"
            className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none"/>
        </div>}
      </header>
      <nav aria-label="Deal role modes" className="mb-3 flex w-fit items-center gap-1 border-b border-black/10 pb-2">
        {['talent','client'].map(value=><button type="button" key={value}
          aria-pressed={role===value} onClick={()=>setView(value,'incoming')}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[12px] font-black ${role===value?'bg-[#0A13E6] text-white':'text-black/60 hover:bg-black/5'}`}>
          <span className={`grid h-7 w-7 place-items-center rounded-full ${role===value?'bg-white text-[#0A13E6]':'bg-black/10 text-black'}`}>{value==='talent'?'T':'C'}</span>
          {value==='talent'?'Talent':'Client'}
        </button>)}
      </nav>
      <section className="space-y-3" aria-label="My Deals">
        <div>
          <h2 className="text-[18px] font-black">{title}</h2>
          <p className="mt-0.5 text-[12px] font-medium text-black/50">{subtitle}</p>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {[
            ['incoming', 'Incoming'],
            ['outgoing', 'Outgoing'],
            ['active', 'Active'],
            ['history', 'History'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setView(role, value)}
              className={`h-9 shrink-0 rounded-full border-[1.5px] px-4 text-[12px] font-black transition ${
                tab === value ? 'border-black bg-black text-white' : 'border-black/15 bg-white text-black/60'
              }`}
            >
              {label} ({Number(counts[value] || 0)})
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4">
          {loading ? (
            <Skeletons />
          ) : visibleItems.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center px-6 text-center">
              <div>
                {tab === 'history' ? <History size={30} className="mx-auto mb-3 text-black/25" /> : <Handshake size={30} className="mx-auto mb-3 text-black/25" />}
                <p className="text-[13px] font-bold text-black/50">{empty}</p>
              </div>
            </div>
          ) : (
            <div aria-label={viewMode==='grid'?'Deals grid':'Deals list'} className={viewMode==='grid'?'grid gap-3 md:grid-cols-2':'flex flex-col divide-y divide-black/10'}>
              {visibleItems.map((item) => {
                const isApplication = Boolean(item.application_id) && !item.id
                const id = isApplication ? item.application_id : item.id
                const peer = peerFor(item, role, isApplication)
                const negotiable = item.price_type === 'range' || item.price_negotiable
                const unresolvedRange = negotiable && !item.agreed_at
                const currency = item.deal_currency || item.currency || 'NGN'
                const amount = isApplication ? item.agreed_amount : item.amount
                const status = isApplication
                  ? item.status
                  : item.status === 'not_funded' ? item.request_state : item.status

                return (
                  <article key={`${isApplication ? 'app' : 'deal'}-${id}`}
                    className={`relative min-w-0 overflow-hidden bg-white ${viewMode==='grid'?'rounded-2xl p-1 shadow-sm':'py-2'}`}>
                    <RoleCardBadge role={peer.role} className="absolute right-3 top-3 z-0" />
                    <div className="p-4 pr-14">
                      <div className="flex gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[13px] border border-black/10 bg-[#F5F3EF]">
                          {peer.avatar || item.hat_thumbnail ? (
                            <img src={peer.avatar || item.hat_thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center font-black text-black/35">{(peer.name || peer.username || '?').slice(0, 1).toUpperCase()}</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-black">{item.hat_title}</p>
                          <p className="truncate text-[12px] font-semibold text-black/55">{peer.name || 'ChombuTar user'} {peer.username ? `^${peer.username}` : ''}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] font-semibold text-black/40">
                            {peer.lga && <span>{peer.lga}</span>}
                            <span className="inline-flex items-center gap-1"><Clock size={11} />{new Date(item.created_at || item.applied_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#F5F3EF] px-2.5 py-1 text-[10px] font-black">{niceStatus(status)}</span>
                        {amount != null && <span className="text-[12px] font-black">{money(amount, currency)}{item.pay_unit ? ` /${item.pay_unit}` : ''}</span>}
                      </div>

                      {item.price_type === 'range' && (
                        <p className="mt-2 text-[11px] font-semibold text-black/50">
                          {item.agreed_at ? `Agreed at ${money(amount, currency)}` : item.pending_offer_amount != null ? `Proposal: ${money(item.pending_offer_amount, currency)}` : 'Price negotiation not completed'}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t border-black/10 px-4 py-3">
                      {tab === 'incoming' && (
                        <>
                          <button type="button" disabled={busyId === id} onClick={() => respond(item, 'rejected')} className="h-9 rounded-full border-[1.5px] border-black px-4 text-[11px] font-black disabled:opacity-50">{busyId === id ? 'Rejecting…' : 'Reject'}</button>
                          <button type="button" disabled={busyId === id || unresolvedRange} onClick={() => respond(item, 'accepted')} className="h-9 rounded-full border-[1.5px] border-black bg-[#0A13E6] px-4 text-[11px] font-black text-white disabled:opacity-50">
                            <span className="inline-flex items-center gap-1.5"><Check size={14} />{busyId === id ? 'Accepting…' : unresolvedRange ? 'Agree price first' : 'Accept'}</span>
                          </button>
                        </>
                      )}

                      {tab === 'outgoing' && isApplication && (
                        <button type="button" disabled={busyId === id} onClick={() => withdrawApplication(item)} className="h-9 rounded-full border border-black/20 px-4 text-[11px] font-black text-black/60 disabled:opacity-50">{busyId === id ? 'Withdrawing…' : 'Withdraw'}</button>
                      )}

                      {negotiable && (item.negotiation_escrow_id || item.id) && (
                        <Link to={`/negotiations?escrow=${item.negotiation_escrow_id || item.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black px-4 text-[11px] font-black">
                          <Handshake size={14} />{item.agreed_at ? 'Agreement' : 'Negotiate'}
                        </Link>
                      )}

                      {!isApplication && (
                        <>
                          <Link to={`/messages?escrow=${item.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black px-4 text-[11px] font-black"><MessageCircle size={14} />Deals Chat</Link>
                          <Link to={`/deals/${item.id}?role=${role}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black px-4 text-[11px] font-black text-white">
                            {tab === 'history' ? 'View record' : 'Open deal'} <ChevronRight size={14} />
                          </Link>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {nextCursor && (
            <div className="mt-5 text-center">
              <button type="button" disabled={paging} onClick={loadOlder} className="h-10 rounded-full border-[1.5px] border-black bg-white px-5 text-[11px] font-black disabled:opacity-50">
                {paging ? 'Loading…' : 'Load older'}
              </button>
            </div>
          )}
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 items-center justify-between gap-4 rounded-[14px] bg-black px-4 py-3 text-white shadow-xl sm:bottom-7">
          <p className="text-[12px] font-bold">{toast.message}</p>
          <button type="button" onClick={toast.undo} className="inline-flex items-center gap-1.5 text-[12px] font-black underline underline-offset-4"><Undo2 size={14} />Undo</button>
        </div>
      )}
    </div>
  )
}
