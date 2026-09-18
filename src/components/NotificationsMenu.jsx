import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'

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

export default function NotificationsMenu({ panelPosition = 'down', className = '', buttonClassName = '', iconSize = 16 }) {
  const navigate = useNavigate()
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
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#FF5A1F] text-white text-[10px] font-black grid place-items-center border border-black">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 ${
            panelPosition === 'up' ? 'bottom-11' : 'top-11'
          } w-[min(22rem,calc(100vw-1rem))] bg-white border-[1.5px] border-black rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.18)] overflow-hidden z-50`}
        >
          <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-black">Notifications</p>
              <p className="text-[11px] text-black/45 font-medium">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={!unreadCount}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-black/15 text-[11px] font-bold disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#F7F3EB]"
            >
              <CheckCheck size={13} />
              Mark all
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-[12px] text-black/45 font-medium">Loading...</p>
            ) : error ? (
              <p className="px-4 py-6 text-[12px] text-red-600 font-medium">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-black/45 font-medium">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  className="w-full text-left px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-[#F7F3EB] transition flex gap-3"
                >
                  <span
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      notification.unread ? 'bg-[#0A13E6]' : 'bg-black/15'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-[12px] font-black leading-tight text-black">{notification.title}</span>
                      <span className="text-[10px] text-black/40 font-bold shrink-0">{relativeTime(notification.created_at)}</span>
                    </span>
                    {notification.body && (
                      <span className="block text-[12px] text-black/55 leading-snug mt-1 break-words">{notification.body}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}