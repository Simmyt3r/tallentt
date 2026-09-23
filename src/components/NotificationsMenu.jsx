import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, CheckCheck, CheckCircle2, Handshake, Info, Send, WalletCards, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

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
    <div className="p-2 space-y-1.5" aria-label="Loading notifications">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-3 rounded-[16px] p-3 animate-pulse">
          <div className="w-10 h-10 rounded-[12px] bg-black/[0.06] shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 w-1/2 rounded bg-black/[0.08]" />
            <div className="h-3 w-4/5 rounded bg-black/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NotificationsMenu({ panelPosition = 'down', panelAlign = 'right', className = '', buttonClassName = '', iconSize = 16 }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await api.getNotifications()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
      setError('')
    } catch (err) {
      if (!quiet) setError(err.message || 'Could not load notifications.')
      console.error('notification load failed:', err)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load({ quiet: true })
    const id = setInterval(() => load({ quiet: true }), 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, { onChange: () => load({ quiet: true }) })
    return () => connection.close()
  }, [load, user?.id])

  useEffect(() => {
    if (!open) return undefined
    load()
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [load, open])

  async function markOne(notification) {
    if (!notification?.unread) return
    setNotifications((list) =>
      list.map((n) => (n.id === notification.id ? { ...n, unread: false, read_at: new Date().toISOString() } : n)),
    )
    setUnreadCount((count) => Math.max(0, count - 1))
    try {
      const data = await api.markNotificationRead(notification.id)
      setUnreadCount(data.unreadCount || 0)
    } catch (err) {
      console.error('notification mark-read failed:', err)
      load({ quiet: true })
    }
  }

  async function markAll() {
    if (!unreadCount) return
    const now = new Date().toISOString()
    setNotifications((list) => list.map((n) => ({ ...n, unread: false, read_at: n.read_at || now })))
    setUnreadCount(0)
    try {
      await api.markAllNotificationsRead()
    } catch (err) {
      console.error('notification mark-all failed:', err)
      load({ quiet: true })
    }
  }

  async function openNotification(notification) {
    await markOne(notification)
    setOpen(false)
    if (notification.link_url) navigate(notification.link_url)
  }

  return (
    <div className={`relative shrink-0 ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          buttonClassName ||
          'relative w-9 h-9 rounded-full border-[1.5px] border-black bg-white flex items-center justify-center text-black/70 hover:bg-black hover:text-white transition'
        }
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#FF5A1F] text-white text-[10px] font-black grid place-items-center border-[1.5px] border-black shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`absolute ${panelAlign === 'left' ? 'left-0' : 'right-0'} ${
            panelPosition === 'up' ? 'bottom-12' : 'top-12'
          } w-[calc(100vw-1rem)] max-w-[24rem] max-h-[calc(100dvh-5rem)] bg-[#F7F3EB] border-[1.5px] border-black rounded-[22px] shadow-[0_20px_50px_rgba(0,0,0,0.22)] overflow-hidden z-50`}
        >
          <div className="px-3 sm:px-4 py-3.5 border-b-[1.5px] border-black bg-white flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <span className="w-9 h-9 shrink-0 rounded-[11px] bg-black text-white grid place-items-center">
                <Bell size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-black leading-tight">Notifications</p>
                <p className="text-[11px] text-black/45 font-semibold mt-0.5" aria-live="polite">
                  {unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={!unreadCount}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-full border-[1.5px] border-black/15 bg-[#F7F3EB] text-[11px] font-black disabled:opacity-35 disabled:cursor-not-allowed hover:border-black transition"
            >
              <CheckCheck size={14} />
              <span className="hidden min-[360px]:inline">Mark all read</span>
              <span className="min-[360px]:hidden">Read all</span>
            </button>
          </div>

          <div className="max-h-[calc(100dvh-10rem)] md:max-h-[min(65vh,560px)] overflow-y-auto">
            {loading ? (
              <LoadingRows />
            ) : error ? (
              <div className="m-3 rounded-[16px] border-[1.5px] border-red-200 bg-red-50 p-4">
                <p className="text-[12px] text-red-700 font-semibold">{error}</p>
                <button type="button" onClick={() => load()} className="mt-3 h-9 px-4 rounded-full border-[1.5px] border-red-300 bg-white text-[11px] font-black text-red-700">
                  Try again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="min-h-[220px] grid place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto w-12 h-12 rounded-[16px] bg-white border-[1.5px] border-black/10 grid place-items-center text-black/30">
                    <Bell size={20} />
                  </span>
                  <p className="mt-3 text-[13px] font-black text-black/65">No notifications yet</p>
                  <p className="mt-1 text-[11px] font-medium text-black/40">Updates about deals, applications and activity will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {notifications.map((notification) => {
                  const { Icon, className: iconClass } = notificationVisual(notification.type)
                  return (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => openNotification(notification)}
                      className={`w-full text-left rounded-[16px] border p-3 transition flex gap-3 ${
                        notification.unread
                          ? 'bg-white border-[#0A13E6]/20 shadow-[0_4px_14px_rgba(10,19,230,0.06)]'
                          : 'bg-transparent border-transparent hover:bg-white hover:border-black/10'
                      }`}
                    >
                      <span className={`w-10 h-10 rounded-[12px] border grid place-items-center shrink-0 ${iconClass}`}>
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="text-[12.5px] font-black leading-tight text-black flex-1">{notification.title}</span>
                          <span className="text-[10px] text-black/35 font-bold shrink-0">{relativeTime(notification.created_at)}</span>
                        </span>
                        {notification.body && (
                          <span className="block text-[11.5px] text-black/55 leading-snug mt-1 break-words">{notification.body}</span>
                        )}
                        <span className="mt-2 flex items-center justify-between gap-2">
                          {notification.unread ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#0A13E6]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0A13E6]" />
                              New
                            </span>
                          ) : (
                            <span />
                          )}
                          {notification.link_url && <ArrowRight size={14} className="text-black/30" />}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
