// Path: src/components/BottomNav.jsx
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Store, LayoutGrid, MessageSquareHeart, MessageCircle, UserRound } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

function BottomNavLink({ to, end, icon: Icon, label, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[9px] sm:text-[10px] min-w-0 font-bold transition-colors ${
          isActive ? 'text-[#0A13E6]' : 'text-black/45'
        }`
      }
    >
      <span className="relative">
        <Icon size={20} />
        {badge > 0 && (
          <span className="absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full bg-[#FF5A1F] text-white text-[9px] font-black grid place-items-center border border-black">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function BottomNav() {
  const { user } = useAuth()
  const [unreadMessages, setUnreadMessages] = useState(0)

  const loadCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const results = await Promise.allSettled([api.getConversations(), api.getCommunityChats(), api.getEmploymentChats()])
      const threads = results.flatMap(result => result.status === 'fulfilled'
        ? result.value.conversations || result.value.threads || [] : [])
      if (results.some(result => result.status === 'fulfilled'))
        setUnreadMessages(threads.reduce((sum,thread)=>sum+Number(thread.unread_count||0),0))
    } catch (error) {
      console.error('inbox unread count failed:', error)
    }
  }, [user?.id])

  useEffect(() => {
    loadCount()
    const id = setInterval(loadCount, 60_000)
    const onLocalChange = () => loadCount()
    window.addEventListener('mydeals:changed', onLocalChange)
    window.addEventListener('inbox:read', onLocalChange)
    return () => {
      clearInterval(id)
      window.removeEventListener('mydeals:changed', onLocalChange)
      window.removeEventListener('inbox:read', onLocalChange)
    }
  }, [loadCount])

  useEffect(() => {
    if (!user?.id) return undefined
    const connection = connectMyDealsRealtime(user.id, { onChange: loadCount })
    return () => connection.close()
  }, [loadCount, user?.id])

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-20 h-[60px] bg-white/95 backdrop-blur-xl border-t-[1.5px] border-black flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <BottomNavLink to="/showroom" icon={Store} label="Showroom" />
      <BottomNavLink to="/bento" icon={LayoutGrid} label="Bento" />
      <BottomNavLink to="/vibes" icon={MessageSquareHeart} label="Vibes" />
      <BottomNavLink to="/inbox" icon={MessageCircle} label="Inbox" badge={unreadMessages} />
      <BottomNavLink to="/profile" icon={UserRound} label="Profile" />
    </nav>
  )
}
