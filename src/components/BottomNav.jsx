// Path: src/components/BottomNav.jsx
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Handshake, Store, Briefcase, LayoutGrid, Radio } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { connectMyDealsRealtime } from '../lib/myDealsRealtime.js'

function BottomNavLink({ to, end, icon: Icon, label, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] min-w-0 font-bold transition-colors ${
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
  const [pendingDeals, setPendingDeals] = useState(0)

  const loadCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await api.getMyDealsCount()
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
      <BottomNavLink to="/showroom" icon={Store} label="Showroom" />
      <BottomNavLink to="/bento" icon={LayoutGrid} label="Bento" />
      <BottomNavLink to="/my-hats" icon={Briefcase} label="My Hats" />
      <BottomNavLink to="/deals" icon={Handshake} label="My Deals" badge={pendingDeals} />
      <BottomNavLink to="/live" icon={Radio} label="Live" />
    </nav>
  )
}
