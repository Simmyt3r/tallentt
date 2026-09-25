import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock, Handshake, MessageCircle, Search, Undo2, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, payForBooking } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'
import RoleCardBadge from './RoleCardBadge.jsx'
import DealQrCheckpoint from './DealQrCheckpoint.jsx'

const FILTERS = ['All', 'Freelance', 'Contract']

function money(value, currency = 'NGN') {
  if (value == null) return '—'
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value))
  } catch {
    return `₦${Number(value).toLocaleString()}`
  }
}

function niceStatus(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function bookingPeer(item, role) {
  const prefix = role === 'talent' ? 'client' : 'talent'
  return {
    username: item[`${prefix}_username`],
    name: item[`${prefix}_full_name`],
    avatar: item[`${prefix}_avatar`],
    lga: item[`${prefix}_lga`] || item.hat_lga,
    role: prefix === 'client' ? 'client' : 'talent',
  }
}

function applicationPeer(item, role) {
  const prefix = role === 'talent' ? 'owner' : 'applicant'
  return {
    username: item[`${prefix}_username`],
    name: item[`${prefix}_full_name`],
    avatar: item[`${prefix}_avatar`],
    lga: item[`${prefix}_lga`] || item.hat_lga,
    role: prefix === 'owner' ? 'client' : 'talent',
  }
}

function Skeletons() {
  return (
    <div className="grid gap-3">
      {[0, 1].map((n) => (
        <div
          key={n}
          className="h-[260px] rounded-[20px] border-[1.5px] border-black/10 bg-white overflow-hidden animate-pulse"
        >
          <div className="h-24 bg-black/[0.06]" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-1/2 rounded bg-black/[0.08]" />
            <div className="h-3 w-2/3 rounded bg-black/[0.06]" />
            <div className="h-9 w-full rounded-full bg-black/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyDealsModal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, refreshUser } = useAuth()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedRole = params.get('role')
  const requestedTab = params.get('tab')
  const initialRole = ['talent', 'client'].includes(requestedRole)
    ? requestedRole
    : localStorage.getItem('_role') || localStorage.getItem('chombutar_role') || 'talent'
  const initialTab = ['incoming', 'outgoing', 'active'].includes(requestedTab) ? requestedTab : 'incoming'

  const [role, setRole] = useState(initialRole)
  const [tab, setTab] = useState(initialTab)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ bookings: [], applications: [], pendingCount: 0 })
  const [loading, setLoading] = useState(true)
  const [quietLoading, setQuietLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const undoTimer = useRef(null)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setQuietLoading(true)
    else setLoading(true)
    try {
      const next = await api.getMyDeals()
      setData({
        bookings: next.bookings || [],
        applications: next.applications || [],
        pendingCount: Number(next.pendingCount || 0),
      })
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load your deals.')
    } finally {
      setLoading(false)
      setQuietLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    localStorage.setItem('_role', role)
    localStorage.setItem('chombutar_role', role)
    window.dispatchEvent(new Event('storage'))
  }, [role])

  useEffect(() => {
    document.documentElement.classList.add('modal-open')
    document.body.classList.add('modal-open')
    const onKey = (event) => {
      if (event.key === 'Escape') navigate('/', { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(undoTimer.current)
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('modal-open')
      document.body.classList.remove('modal-open')
    }
  }, [navigate])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, {
      onChange: () => load({ quiet: true }),
    })
    return () => connection.close()
  }, [load, user?.id])

  const collections = useMemo(() => {
    const bookings = data.bookings || []
    const applications = data.applications || []

    if (role === 'talent') {
      return {
        incoming: bookings.filter(
          (item) => item.request_kind !== 'application' && item.talent_id === user?.id && item.request_state === 'pending',
        ),
        outgoing: applications.filter(
          (item) => item.applicant_id === user?.id && item.status === 'pending',
        ),
        active: bookings.filter(
          (item) => item.talent_id === user?.id && item.request_state === 'accepted',
        ),
      }
    }

    return {
      incoming: applications.filter(
        (item) => item.owner_id === user?.id && item.status === 'pending',
      ),
      outgoing: bookings.filter(
        (item) => item.request_kind !== 'application' && item.client_id === user?.id && item.request_state === 'pending',
      ),
      active: bookings.filter(
        (item) => item.client_id === user?.id && item.request_state === 'accepted',
      ),
    }
  }, [data, role, user?.id])

  const activeItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (collections[tab] || []).filter((item) => {
      const isApplication = Boolean(item.application_id) && !item.id
      const peer = isApplication ? applicationPeer(item, role) : bookingPeer(item, role)
      const matchesFilter =
        filter === 'All' || String(item.hat_type || '').toLowerCase() === filter.toLowerCase()
      const matchesSearch =
        !query ||
        [peer.username, peer.name, peer.lga, item.hat_lga, item.hat_title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      return matchesFilter && matchesSearch
    })
  }, [collections, filter, role, search, tab])

  function notifyLocalChange() {
    window.dispatchEvent(new CustomEvent('mydeals:changed'))
  }

  function armUndo(message, undo) {
    clearTimeout(undoTimer.current)
    setToast({ message, undo })
    undoTimer.current = setTimeout(() => setToast(null), 7000)
  }

  async function respond(item, status) {
    const isApplication = Boolean(item.application_id) && !item.id
    const id = isApplication ? item.application_id : item.id
    setBusyId(id)
    try {
      if (isApplication) {
        await api.respondToApplication(item.hat_id, item.application_id, status)
      } else {
        await api.respondToBooking(item.id, status)
      }
      await load({ quiet: true })
      notifyLocalChange()

      if (status === 'rejected') {
        armUndo('Deal rejected.', async () => {
          setToast(null)
          setBusyId(id)
          try {
            if (isApplication) {
              await api.respondToApplication(item.hat_id, item.application_id, 'pending')
            } else {
              await api.respondToBooking(item.id, 'pending')
            }
            await load({ quiet: true })
            notifyLocalChange()
          } finally {
            setBusyId(null)
          }
        })
      }
    } catch (e) {
      setError(e.message || 'Could not update this deal.')
    } finally {
      setBusyId(null)
    }
  }

  async function withdrawApplication(item) {
    setBusyId(item.application_id)
    try {
      await api.withdrawApplication(item.hat_id)
      await load({ quiet: true })
      notifyLocalChange()
    } catch (e) {
      setError(e.message || 'Could not withdraw this application.')
    } finally {
      setBusyId(null)
    }
  }

  async function fundBooking(item, source) {
    setBusyId(item.id)
    try {
      if (source === 'wallet') {
        await api.fundEscrowWithWallet(item.id, item.amount)
        await refreshUser()
      } else {
        await payForBooking(item, user?.email)
      }
      await load({ quiet: true })
      notifyLocalChange()
    } catch (e) {
      setError(e.message || 'Could not fund this booking.')
    } finally {
      setBusyId(null)
    }
  }

  const title = role === 'talent' ? 'Applications' : 'Bookings'
  const subtitle =
    role === 'talent'
      ? 'Booking requests from clients + Your applications to clients'
      : 'Applications from talents + Your bookings to talents'

  const emptyMessage =
    tab === 'active'
      ? 'No active deals yet.'
      : role === 'talent' && tab === 'incoming'
        ? 'No incoming bookings yet — your Showroom is live'
        : role === 'talent'
          ? 'No outgoing applications yet.'
          : tab === 'incoming'
            ? 'No incoming applications yet — your Hiring Hats are live.'
            : 'No outgoing bookings yet.'

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/45 sm:p-4 flex items-end sm:items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) navigate('/', { replace: true })
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="My Deals"
        className="w-full sm:max-w-[880px] h-[94vh] sm:h-[min(820px,92vh)] bg-[#F7F3EB] border-[1.5px] border-black sm:rounded-[26px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.28)] flex flex-col"
      >
        <header className="sticky top-0 z-10 bg-[#F7F3EB]/95 backdrop-blur-xl border-b-[1.5px] border-black px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Handshake size={21} />
                <h1 className="text-[21px] font-black tracking-tight">My Deals</h1>
                {quietLoading && (
                  <span className="text-[10px] font-bold text-black/35">Updating…</span>
                )}
              </div>
              <p className="text-[12px] text-black/50 font-medium mt-0.5">
                All your active deals in one place
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              aria-label="Close My Deals"
              className="w-9 h-9 rounded-full border-[1.5px] border-black bg-white grid place-items-center hover:bg-black hover:text-white transition"
            >
              <X size={17} />
            </button>
          </div>

          <div className="mt-4 inline-flex rounded-full border-[1.5px] border-black bg-white p-1">
            {['talent', 'client'].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setRole(value)}
                className={`h-9 px-4 rounded-full text-[12px] font-black transition ${
                  role === value
                    ? value === 'talent'
                      ? 'bg-[#0A13E6] text-white'
                      : 'bg-black text-white'
                    : 'text-black/50'
                }`}
              >
                {value === 'talent' ? 'Talent Mode' : 'Client Mode'}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <div>
            <h2 className="text-[18px] font-black">{title}</h2>
            <p className="text-[12px] text-black/50 font-medium mt-0.5">{subtitle}</p>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {[
              ['incoming', 'Incoming'],
              ['outgoing', 'Outgoing'],
              ['active', 'Active Deals'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setTab(value)}
                className={`shrink-0 h-9 px-4 rounded-full border-[1.5px] text-[12px] font-black transition ${
                  tab === value
                    ? 'bg-black text-white border-black'
                    : 'bg-white border-black/15 text-black/60'
                }`}
              >
                {label} ({collections[value]?.length || 0})
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <label className="flex-1 h-11 rounded-full border-[1.5px] border-black bg-white px-4 flex items-center gap-2">
              <Search size={16} className="text-black/40" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by username LGA"
                className="w-full outline-none bg-transparent text-[12px] font-semibold placeholder:text-black/35"
              />
            </label>

            <div className="flex rounded-full border-[1.5px] border-black bg-white p-1 overflow-x-auto">
              {FILTERS.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`h-8 px-3 rounded-full text-[11px] font-black whitespace-nowrap ${
                    filter === value ? 'bg-[#0A13E6] text-white' : 'text-black/50'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-[14px] border-[1.5px] border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4">
            {loading ? (
              <Skeletons />
            ) : activeItems.length === 0 ? (
              <div className="min-h-[260px] rounded-[20px] border-[1.5px] border-dashed border-black/20 bg-white grid place-items-center px-6 text-center">
                <div>
                  <Handshake size={28} className="mx-auto text-black/25 mb-3" />
                  <p className="text-[13px] font-bold text-black/50">{emptyMessage}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeItems.map((item) => {
                  const isApplication = Boolean(item.application_id) && !item.id
                  const id = isApplication ? item.application_id : item.id
                  const peer = isApplication
                    ? applicationPeer(item, role)
                    : bookingPeer(item, role)
                  const incomingPending = tab === 'incoming'
                  const unresolvedRange = item.price_type === 'range' && !item.agreed_at
                  const outgoingApplication = tab === 'outgoing' && isApplication
                  const activeBooking = tab === 'active' && !isApplication
                  const canUseWallet =
                    activeBooking &&
                    role === 'client' &&
                    Number(user?.walletBalance || 0) >= Number(item.amount || 0)
                  const status = isApplication
                    ? item.status
                    : item.status === 'not_funded'
                      ? item.request_state
                      : item.status
                  const dealCurrency = item.deal_currency || item.currency || 'NGN'
                  const rangeLabel =
                    item.price_type === 'range'
                      ? [item.price_min, item.price_max]
                          .filter((value, index, values) => value != null && (index === 0 || value !== values[0]))
                          .map((value) => money(value, dealCurrency))
                          .join(' – ')
                      : null
                  const agreedAmount = isApplication ? item.agreed_amount : item.amount
                  const pendingOfferByMe = item.pending_offer_sender_id === user?.id

                  return (
                    <article
                      key={`${isApplication ? 'app' : 'booking'}-${id}`}
                      className="relative rounded-[20px] border-[1.5px] border-black bg-white overflow-hidden"
                    >
                      <RoleCardBadge role={peer.role} className="absolute top-3 right-3 z-10" />
                      <div className="p-4 sm:p-5 flex gap-3 pr-14">
                        <div className="w-12 h-12 rounded-[13px] border border-black/10 bg-[#F5F3EF] overflow-hidden shrink-0">
                          {peer.avatar || item.hat_thumbnail ? (
                            <img
                              src={peer.avatar || item.hat_thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full grid place-items-center font-black text-black/35">
                              {(peer.name || peer.username || '?').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[14px] font-black truncate">{item.hat_title}</p>
                              <p className="text-[12px] text-black/55 font-semibold truncate">
                                {peer.name || 'ChombuTar user'}{' '}
                                {peer.username ? `^${peer.username}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 mr-1 rounded-full bg-[#F5F3EF] px-2.5 py-1 text-[10px] font-black">
                              {niceStatus(status)}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-black/45">
                            {peer.lga && <span>{peer.lga}</span>}
                            {item.hat_type && <span>{item.hat_type}</span>}
                            {item.hiring_duration && <span>{item.hiring_duration}</span>}
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} />
                              {new Date(item.created_at || item.applied_at).toLocaleDateString()}
                            </span>
                          </div>

                          {item.price_type === 'range' ? (
                            <div className="mt-3 rounded-[13px] border border-black/10 bg-[#F7F3EB] px-3 py-2.5">
                              <p className="text-[9.5px] font-black uppercase tracking-[0.1em] text-black/35">
                                Listed range
                              </p>
                              <p className="mt-0.5 text-[12px] font-black">
                                {rangeLabel || 'Flexible'}{item.pay_unit ? ` /${item.pay_unit}` : ''}
                              </p>
                              {item.agreed_at ? (
                                <p className="mt-1 text-[11.5px] font-black text-emerald-700">
                                  Agreed: {money(agreedAmount, dealCurrency)}{item.pay_unit ? ` /${item.pay_unit}` : ''}
                                </p>
                              ) : item.pending_offer_amount != null ? (
                                <p className="mt-1 text-[11.5px] font-black text-[#0A13E6]">
                                  {pendingOfferByMe ? 'Your proposal' : 'Current proposal'}: {money(item.pending_offer_amount, dealCurrency)}
                                  {item.pay_unit ? ` /${item.pay_unit}` : ''}
                                </p>
                              ) : (
                                <p className="mt-1 text-[11px] font-semibold text-black/45">Awaiting a proposal</p>
                              )}
                            </div>
                          ) : !isApplication ? (
                            <p className="mt-2 text-[13px] font-black">
                              {money(item.amount, dealCurrency)}{item.pay_unit ? ` /${item.pay_unit}` : ''}
                            </p>
                          ) : null}
                          {isApplication && item.message && (
                            <p className="mt-2 text-[12px] text-black/60 leading-relaxed">
                              {item.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-black/10 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-end gap-2">
                        {isApplication && item.price_type === 'range' && item.negotiation_escrow_id && (
                          <Link
                            to={`/messages?escrow=${item.negotiation_escrow_id}`}
                            className="h-9 px-4 rounded-full border-[1.5px] border-black text-[11px] font-black inline-flex items-center gap-1.5"
                          >
                            <MessageCircle size={14} /> {item.agreed_at ? 'View agreement' : 'Negotiate'}
                          </Link>
                        )}

                        {incomingPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => respond(item, 'rejected')}
                              disabled={busyId === id}
                              className="h-9 px-4 rounded-full border-[1.5px] border-black text-[11px] font-black hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => respond(item, 'accepted')}
                              disabled={busyId === id || unresolvedRange}
                              title={unresolvedRange ? 'Agree the Range price before accepting.' : undefined}
                              className="h-9 px-4 rounded-full bg-[#0A13E6] text-white border-[1.5px] border-black text-[11px] font-black inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Check size={14} /> {unresolvedRange ? 'Agree price first' : 'Accept'}
                            </button>
                          </>
                        )}

                        {outgoingApplication && (
                          <button
                            type="button"
                            onClick={() => withdrawApplication(item)}
                            disabled={busyId === id}
                            className="h-9 px-4 rounded-full border-[1.5px] border-black/25 text-[11px] font-black text-black/60 hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        )}

                        {!isApplication && (
                          <Link
                            to={`/messages?escrow=${item.id}`}
                            className="h-9 px-4 rounded-full border-[1.5px] border-black text-[11px] font-black inline-flex items-center gap-1.5"
                          >
                            <MessageCircle size={14} /> {unresolvedRange ? 'Negotiate' : item.price_type === 'range' && item.agreed_at ? 'View agreement' : 'Conversation'}
                          </Link>
                        )}

                        {activeBooking &&
                          role === 'client' &&
                          item.status === 'not_funded' && (
                            <>
                              {canUseWallet && (
                                <button
                                  type="button"
                                  onClick={() => fundBooking(item, 'wallet')}
                                  disabled={busyId === id}
                                  className="h-9 px-4 rounded-full bg-[#0A13E6] text-white border-[1.5px] border-black text-[11px] font-black disabled:opacity-50"
                                >
                                  Pay from wallet
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => fundBooking(item, 'card')}
                                disabled={busyId === id}
                                className={`h-9 px-4 rounded-full border-[1.5px] border-black text-[11px] font-black disabled:opacity-50 ${
                                  canUseWallet ? 'bg-white' : 'bg-[#0A13E6] text-white'
                                }`}
                              >
                                {canUseWallet ? 'Pay with card' : 'Fund escrow'}
                              </button>
                            </>
                          )}
                      </div>
                      {activeBooking && item.status === 'secured' &&
                        ['awaiting_start', 'awaiting_completion'].includes(item.work_status) && (
                          <DealQrCheckpoint booking={item} role={role} onComplete={async () => {
                            await refreshUser()
                            await load({ quiet: true })
                            notifyLocalChange()
                          }} />
                        )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {toast && (
        <div className="fixed z-[95] left-1/2 -translate-x-1/2 bottom-20 sm:bottom-7 w-[min(92vw,420px)] rounded-[14px] bg-black text-white px-4 py-3 shadow-xl flex items-center justify-between gap-4">
          <p className="text-[12px] font-bold">{toast.message}</p>
          <button
            type="button"
            onClick={toast.undo}
            className="inline-flex items-center gap-1.5 text-[12px] font-black text-white underline underline-offset-4"
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}
    </div>
  )
}
