// Path: src/components/BottomNav.jsx
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Store, Radio } from 'lucide-react'
import NotificationsMenu from './NotificationsMenu.jsx'

function BottomNavLink({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10.5px] font-bold transition-colors ${
          isActive ? 'text-[#0A13E6]' : 'text-black/45'
        }`
      }
    >
      <Icon size={20} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const alertsActive = pathname.startsWith('/notifications')

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-20 h-[60px] bg-white/95 backdrop-blur-xl border-t-[1.5px] border-black flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <BottomNavLink to="/" end icon={Home} label="Home" />
      <BottomNavLink to="/showroom" icon={Store} label="Showroom" />
      <BottomNavLink to="/live" icon={Radio} label="Go Live" />
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