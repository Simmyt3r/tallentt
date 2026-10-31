// Path: src/components/BottomNav.jsx
import { NavLink } from 'react-router-dom'
import { Store, LayoutGrid, MessageSquareHeart } from 'lucide-react'
import WorkPassNavIcon from './WorkPassNavIcon.jsx'

function BottomNavLink({ to, end, icon: Icon, label }) {
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
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function BottomNav({ onOpenWorkPass, workPassOpen = false }) {

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-20 h-[60px] bg-white/95 backdrop-blur-xl border-t-[1.5px] border-black flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <BottomNavLink to="/showroom" icon={Store} label="Showroom" />
      <BottomNavLink to="/bento" icon={LayoutGrid} label="Bento" />
      <BottomNavLink to="/vibes" icon={MessageSquareHeart} label="Vibes" />
      <button type="button" onClick={onOpenWorkPass} aria-label="Open my Work Pass"
        aria-pressed={workPassOpen}
        className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-bold transition-colors sm:text-[10px] ${workPassOpen?'text-[#0A13E6]':'text-black/45 hover:text-[#0A13E6]'}`}>
        <WorkPassNavIcon size={24} />
        <span>Work Pass</span>
      </button>
    </nav>
  )
}
