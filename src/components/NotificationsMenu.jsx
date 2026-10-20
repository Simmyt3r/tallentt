import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

export default function NotificationsMenu({ className = '', buttonClassName = '', iconSize = 16 }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadByLane,setUnreadByLane]=useState({bento:0,money:0,associates:0,fame:0})

  const loadCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await api.getNotificationCount()
      setUnreadCount(Number(data.unreadCount || 0))
      if(data.unreadByLane)setUnreadByLane(data.unreadByLane)
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

  useEffect(() => {
    const onPush = () => loadCount()
    window.addEventListener('push:notification', onPush)
    return () => window.removeEventListener('push:notification', onPush)
  }, [loadCount])

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
        {unreadCount>0 && <span className="absolute -top-2 -right-2 flex items-center gap-0.5" aria-hidden="true">
          {(Number(unreadByLane.bento||0)+Number(unreadByLane.money||0)>0)&&<span className="h-3 w-3 rounded-full border-2 border-white bg-red-600 shadow-sm"/>}
          {(Number(unreadByLane.associates||0)+Number(unreadByLane.fame||0)>0)&&<span className="h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow-sm"/>}
        </span>}
      </Link>
    </div>
  )
}
