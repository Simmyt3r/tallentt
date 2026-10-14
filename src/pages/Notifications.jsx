import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, CheckCheck, CheckCircle2, Handshake, Info, Send, WalletCards, XCircle, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'
import PushNotificationSettings from '../components/PushNotificationSettings.jsx'

function relativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function notificationVisual(type = '') {
  const value = String(type).toLowerCase()
  if (value.includes('rejected') || value.includes('cancelled') || value.includes('failed')) {
    return { Icon: XCircle, className: 'bg-red-50 text-red-600 border-red-200' }
  }
  if (value.includes('accepted') || value.includes('secured') || value.includes('released') || value.includes('success')) {
    return { Icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }
  if (value.includes('booking') || value.includes('deal') || value.includes('escrow')) {
    return { Icon: Handshake, className: 'bg-[#EEF0FF] text-[#0A13E6] border-[#0A13E6]/15' }
  }
  if (value.includes('application') || value.includes('sent')) {
    return { Icon: Send, className: 'bg-[#F7F3EB] text-black border-black/10' }
  }
  if (value.includes('wallet') || value.includes('withdrawal') || value.includes('topup')) {
    return { Icon: WalletCards, className: 'bg-[#FFF4E8] text-[#9A4F00] border-[#9A4F00]/15' }
  }
  return { Icon: Info, className: 'bg-[#F7F3EB] text-black/65 border-black/10' }
}

function LoadingRows() {
  return (
    <div className="space-y-2" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex gap-3 rounded-[18px] border border-black/10 bg-white p-4 animate-pulse">
          <div className="w-11 h-11 rounded-[13px] bg-black/[0.06] shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 w-1/3 rounded bg-black/[0.08]" />
            <div className="h-3 w-4/5 rounded bg-black/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Notifications() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [paging, setPaging] = useState(false)
  const olderLoadedRef = useRef(false)
  const refreshSequenceRef = useRef(0)

  const load = useCallback(async ({ quiet = false } = {}) => {
    const sequence = ++refreshSequenceRef.current
    if (!quiet) setLoading(true)
    try {
      const data = await api.getNotifications()
      if (sequence !== refreshSequenceRef.current) return
      const fresh = data.notifications || []
      // A background refresh must not erase the older pages someone has
      // already loaded. Merge fresh status fields by ID without duplicates.
      setNotifications((current) => {
        if (!quiet) return fresh
        const seen = new Set(fresh.map((item) => item.id))
        return [...fresh, ...current.filter((item) => !seen.has(item.id))]
      })
      setUnreadCount(Number(data.unreadCount || 0))
      if (!quiet || !olderLoadedRef.current) setNextCursor(data.nextCursor || null)
      setError('')
    } catch (err) {
      if (sequence === refreshSequenceRef.current && !quiet) {
        setError(err.message || 'Could not load notifications.')
      }
    } finally {
      if (sequence === refreshSequenceRef.current && !quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load({ quiet: true }), 60_000)
    return () => {
      clearInterval(id)
      refreshSequenceRef.current += 1
    }
  }, [load])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, { onChange: () => load({ quiet: true }) })
    return () => connection.close()
  }, [load, user?.id])

  useEffect(() => {
    const onPush = () => load({ quiet: true })
    window.addEventListener('push:notification', onPush)
    return () => window.removeEventListener('push:notification', onPush)
  }, [load])

  async function loadOlder() {
    if (!nextCursor || paging) return
    setPaging(true)
    try {
      const data = await api.getNotifications(nextCursor)
      setNotifications((current) => {
        const seen = new Set(current.map((item) => item.id))
        return [...current, ...(data.notifications || []).filter((item) => !seen.has(item.id))]
      })
      setUnreadCount(Number(data.unreadCount || 0))
      olderLoadedRef.current = true
      setNextCursor(data.nextCursor || null)
    } catch (err) {
      setError(err.message || 'Could not load older notifications.')
    } finally {
      setPaging(false)
    }
  }

  async function markOne(notification) {
    if (!notification?.unread) return
    setNotifications((list) =>
      list.map((item) => item.id === notification.id
        ? { ...item, unread: false, read_at: new Date().toISOString() }
        : item),
    )
    setUnreadCount((count) => Math.max(0, count - 1))
    try {
      const data = await api.markNotificationRead(notification.id)
      setUnreadCount(Number(data.unreadCount || 0))
    } catch {
      load({ quiet: true })
    }
  }

  async function markAll() {
    if (!unreadCount) return
    const now = new Date().toISOString()
    setNotifications((list) => list.map((item) => ({
      ...item,
      unread: false,
      read_at: item.read_at || now,
    })))
    setUnreadCount(0)
    try {
      await api.markAllNotificationsRead()
    } catch {
      load({ quiet: true })
    }
  }

  async function removeNotification(notification) {
    try {
      await api.deleteNotification(notification.id)
      setNotifications((list) => list.filter((item) => item.id !== notification.id))
      if (notification.unread) setUnreadCount((value) => Math.max(0, value - 1))
      window.dispatchEvent(new Event('push:notification'))
    } catch (err) {
      setError(err.message || 'Could not delete this notification.')
    }
  }

  async function clearInbox() {
    if (!notifications.length || !window.confirm('Clear your notification inbox? This cannot be undone.')) return
    try {
      await api.clearNotifications()
      setNotifications([])
      setUnreadCount(0)
      setNextCursor(null)
      olderLoadedRef.current = false
      window.dispatchEvent(new Event('push:notification'))
    } catch (err) {
      setError(err.message || 'Could not clear notifications.')
    }
  }

  async function openNotification(notification) {
    await markOne(notification)
    if (notification.link_url) navigate(notification.link_url)
  }

  return (
    <main className="max-w-4xl mx-auto pb-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={22} />
            <h1 className="text-[23px] font-black">Notifications</h1>
          </div>
          <p className="mt-1 text-[12px] font-medium text-black/50">
            Deal, application, payment and platform updates in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={clearInbox}
          disabled={!notifications.length}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-red-200 bg-white px-4 text-[11px] font-black text-red-700 disabled:opacity-35">
          <Trash2 size={14} /> Clear all
        </button>
        <button
          type="button"
          onClick={markAll}
          disabled={!unreadCount}
          className="inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-black bg-white px-4 text-[11px] font-black disabled:opacity-35"
        >
          <CheckCheck size={15} />
          Mark all read
        </button>
        </div>
      </header>

      <PushNotificationSettings />

      <section className="overflow-hidden rounded-[22px] border-[1.5px] border-black bg-[#F7F3EB]" aria-label="Notification list">
        <div className="border-b border-black/10 bg-white px-4 py-3">
          <p className="text-[12px] font-black">{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</p>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <LoadingRows />
          ) : error ? (
            <div className="rounded-[16px] border border-red-200 bg-red-50 p-4">
              <p className="text-[12px] font-semibold text-red-700">{error}</p>
              <button type="button" onClick={() => load()} className="mt-3 h-9 rounded-full border border-red-300 bg-white px-4 text-[11px] font-black text-red-700">
                Try again
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="min-h-[300px] grid place-items-center px-6 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-black/10 bg-white text-black/30">
                  <Bell size={22} />
                </span>
                <p className="mt-3 text-[14px] font-black text-black/65">No notifications yet</p>
                <p className="mt-1 text-[11.5px] font-medium text-black/40">Updates about deals, applications and activity will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const { Icon, className: iconClass } = notificationVisual(notification.type)
                return (
                  <div key={notification.id} className="flex min-w-0 items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`min-w-0 flex-1 rounded-[18px] border p-4 text-left transition flex gap-3 ${
                      notification.unread
                        ? 'bg-white border-[#0A13E6]/20 shadow-[0_4px_14px_rgba(10,19,230,0.06)]'
                        : 'bg-white/55 border-black/10 hover:bg-white'
                    }`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border ${iconClass}`}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-3">
                        <span className="flex-1 text-[13px] font-black leading-tight">{notification.title}</span>
                        <span className="shrink-0 text-[10px] font-bold text-black/35">{relativeTime(notification.created_at)}</span>
                      </span>
                      {notification.body && (
                        <span className="mt-1 block break-words text-[11.5px] leading-relaxed text-black/55">{notification.body}</span>
                      )}
                      <span className="mt-2 flex items-center justify-between gap-2">
                        {notification.unread ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#0A13E6]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0A13E6]" />
                            New
                          </span>
                        ) : <span />}
                        {notification.link_url && <ArrowRight size={14} className="text-black/30" />}
                      </span>
                    </span>
                  </button>
                  <button type="button" aria-label={`Delete notification: ${notification.title}`}
                    onClick={() => removeNotification(notification)}
                    title="Delete notification"
                    className="w-10 shrink-0 rounded-2xl border border-black/10 bg-white text-red-600 grid place-items-center hover:bg-red-50">
                    <Trash2 size={17} />
                  </button>
                  </div>
                )
              })}
              {nextCursor && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={paging}
                    className="h-10 rounded-full border-[1.5px] border-black bg-white px-5 text-[11px] font-black disabled:opacity-50"
                  >
                    {paging ? 'Loading…' : 'Load older'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
