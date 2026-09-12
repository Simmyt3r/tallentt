// Path: src/components/Layout.jsx
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Home, Store, UserRound, PlusCircle, LogOut, Briefcase, ClipboardList, CalendarCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [browseRole, setBrowseRole] = useState(() => localStorage.getItem('chombutar_role') || 'talent')

  useEffect(() => {
    localStorage.setItem('chombutar_role', browseRole)
  }, [browseRole])

  async function handleLogout() {
    await logout()
    navigate('/auth')
  }

  const helper =
    browseRole === 'talent'
      ? 'You are browsing as Talent → viewing Client cards'
      : 'You are browsing as Client → viewing Talent cards'

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EB] text-black antialiased">
      <header className="sticky top-0 z-40 bg-[#F7F3EB]/90 backdrop-blur-xl border-b-[1.5px] border-black">
        <div className="mx-auto max-w-[1000px] px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo.png" alt="ChombuTar" className="w-11 h-11 object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavItem to="/" icon={Home} label="Feed" />
            <NavItem to="/showroom" icon={Store} label="Showroom" />
            <NavItem to="/my-hats" icon={Briefcase} label="My Hats" />
            <NavItem to="/my-applications" icon={ClipboardList} label="Applications" />
            <NavItem to="/my-bookings" icon={CalendarCheck} label="Bookings" />
            <NavItem to="/create" icon={PlusCircle} label="Create" />
            <NavItem to="/profile" icon={UserRound} label="Profile" />
          </nav>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white border-[1.5px] border-black p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setBrowseRole('talent')}
                className={`px-3 py-1.5 rounded-full transition ${
                  browseRole === 'talent' ? 'bg-[#0A13E6] text-white' : 'text-black/60 hover:text-black'
                }`}
              >
                Talent
              </button>
              <button
                type="button"
                onClick={() => setBrowseRole('client')}
                className={`px-3 py-1.5 rounded-full transition ${
                  browseRole === 'client' ? 'bg-black text-white' : 'text-black/60 hover:text-black'
                }`}
              >
                Client
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-9 h-9 rounded-full border-[1.5px] border-black bg-white flex items-center justify-center text-black/60 hover:bg-black hover:text-white transition"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] text-black/50 pb-2.5 px-4 font-medium">{helper}</p>
      </header>

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 md:px-6 py-6">{children}</main>

      {/* Mobile bottom nav — matches reference */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 p-3">
        <div className="bg-white rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.18)] border-[1.5px] border-black/5 px-2 h-14 flex items-center justify-around">
          <NavItem to="/" icon={Home} label="Feed" mobile />
          <NavItem to="/showroom" icon={Store} label="Show" mobile />
          <NavItem to="/my-applications" icon={ClipboardList} label="Apps" mobile />
          <NavItem to="/create" icon={PlusCircle} label="+" mobile accent />
          <NavItem to="/my-bookings" icon={CalendarCheck} label="Book" mobile />
          <NavItem to="/my-hats" icon={Briefcase} label="Hats" mobile />
          <NavItem to="/profile" icon={UserRound} label="You" mobile />
        </div>
      </nav>
      <div className="md:hidden h-20" />
    </div>
  )
}

function NavItem({ to, icon: Icon, label, mobile, accent }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        mobile
          ? `w-10 h-10 rounded-full grid place-items-center transition ${
              accent
                ? 'bg-black text-white w-12 h-12 text-[18px]'
                : isActive
                  ? 'bg-[#0A13E6] text-white'
                  : 'opacity-50'
            }`
          : `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition ${
              isActive ? 'bg-[#0A13E6] text-white' : 'text-black/60 hover:text-black hover:bg-white'
            }`
      }
    >
      {mobile && accent ? <PlusCircle size={22} /> : <Icon size={mobile ? 18 : 15} />}
      {!mobile && label}
    </NavLink>
  )
}

export function useBrowseRole() {
  const [role, setRole] = useState(() => localStorage.getItem('chombutar_role') || 'talent')
  useEffect(() => {
    const onStorage = () => setRole(localStorage.getItem('chombutar_role') || 'talent')
    window.addEventListener('storage', onStorage)
    const id = setInterval(onStorage, 400)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(id)
    }
  }, [])
  return role
}