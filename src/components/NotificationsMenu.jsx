import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

export default function NotificationsMenu({ className = '', buttonClassName = '', iconSize = 16 }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const loadCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await api.getNotifications()
      setUnreadCount(Number(data.unreadCount || 0))
    } catch (error) {
      console.error('notification count failed:', error)
    }
  }, [user?.id])

  useEffect(() => {
    loadCount()
    const id = setInterval(loadCount, 60_000)
    return () => clearInterval(id)
  }, [loadCount])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, { onChange: loadCount })
    return () => connection.close()
  }, [loadCount, user?.id])

  return (
    <div className={`relative shrink-0 ${className}`}>
      <Link
        to="/notifications"
        className={
          buttonClassName ||
          'relative w-9 h-9 rounded-full border-[1.5px] border-black bg-white flex items-center justify-center text-black/70 hover:bg-black hover:text-white transition'
        }
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#FF5A1F] text-white text-[10px] font-black grid place-items-center border-[1.5px] border-black shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
    </div>
  )
}
