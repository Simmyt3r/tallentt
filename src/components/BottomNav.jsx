// Path: src/components/BottomNav.jsx
import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Handshake, Home, Radio, Store } from 'lucide-react'
import NotificationsMenu from './NotificationsMenu.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

function BottomNavLink({ to, end, icon: Icon, label, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10.5px] font-bold transition-colors ${
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
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [pendingDeals, setPendingDeals] = useState(0)
  const alertsActive = pathname.startsWith('/notifications')

  const loadCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await api.getMyDeals()
      setPendingDeals(Number(data.pendingCount || 0))
    } catch (error) {
      console.error('my deals count failed:', error)
    }
  }, [user?.id])

  useEffect(() => {
    loadCount()
    const id = setInterval(loadCount, 60_000)
    const onLocalChange = () => loadCount()
    window.addEventListener('mydeals:changed', onLocalChange)
    return () => {
      clearInterval(id)
      window.removeEventListener('mydeals:changed', onLocalChange)
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
      <BottomNavLink to="/" end icon={Home} label="Home" />
      <BottomNavLink to="/showroom" icon={Store} label="Showroom" />
      <BottomNavLink to="/deals" icon={Handshake} label="My Deals" badge={pendingDeals} />
      <BottomNavLink to="/live" icon={Radio} label="Live" />
      <div
        className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10.5px] font-bold ${
          alertsActive ? 'text-[#0A13E6]' : 'text-black/45'
        }`}
      >
        <NotificationsMenu
          panelPosition="up"
          iconSize={20}
          buttonClassName="relative w-auto h-auto bg-transparent border-0 flex items-center justify-center text-inherit"
        />
        <span>Alerts</span>
      </div>
    </nav>
  )
}
