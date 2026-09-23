// Path: src/components/Layout.jsx
import { Link, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DesktopSidebar, MobileDrawer, BrandMark } from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import MyDealsModal from './MyDealsModal.jsx'
import { useAuth } from '../context/AuthContext'
import { cldImage } from '../lib/cloudinary'

// Header menu button (icon-only, round, no border — the avatar is the bordered one).
const MENU_BUTTON =
  'h-9 w-9 md:h-10 md:w-10 shrink-0 place-items-center rounded-full text-black transition-colors hover:bg-black/[0.06] active:bg-black/[0.1]'

export default function Layout({ children }) {
  const location = useLocation()
  const { user } = useAuth()
  const [browseRole, setBrowseRole] = useState(() => localStorage.getItem('_role') || localStorage.getItem('chombutar_role') || 'talent')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('chombutar_sidebar_collapsed') === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('_role', browseRole)
    localStorage.setItem('chombutar_role', browseRole)
  }, [browseRole])

  useEffect(() => {
    localStorage.setItem('chombutar_sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  // Close the mobile drawer automatically whenever the route changes (e.g.
  // browser back/forward), in addition to the explicit onNavigate close.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Prevent background scroll while the drawer is open (mirrors the
  // existing .modal-open pattern used elsewhere in the app).
  useEffect(() => {
    document.documentElement.classList.toggle('modal-open', drawerOpen)
    document.body.classList.toggle('modal-open', drawerOpen)
    return () => {
      document.documentElement.classList.remove('modal-open')
      document.body.classList.remove('modal-open')
    }
  }, [drawerOpen])

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const initial = (user?.name || user?.fullName || 'U').slice(0, 1).toUpperCase()

  return (
    <div className="min-h-screen bg-[#F7F3EB] text-black antialiased">
      <DesktopSidebar collapsed={collapsed} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* One responsive header.
          Left  : menu button, then the brand. The menu button opens the drawer
                  on mobile and collapses/expands the sidebar on desktop.
          Right : (mobile only) Talent/Client toggle, then the signed-in user's
                  avatar — always the far-right item, linking to /profile.
          Mobile it is sticky and in flow (h-14 + 1.5px border); on desktop it
          is fixed, full width (h-16) and the sidebar sits underneath it. */}
      <header className="sticky top-0 z-20 border-b-[1.5px] border-black bg-[#F7F3EB]/95 backdrop-blur-xl md:fixed md:inset-x-0 md:h-16">
        <div className="flex h-14 items-center justify-between gap-2 px-3 md:h-full md:px-4">
          <div className="flex min-w-0 items-center gap-1.5 md:gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              className={`${MENU_BUTTON} grid md:hidden`}
            >
              <Menu size={22} />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls="desktop-sidebar"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`${MENU_BUTTON} hidden md:grid`}
            >
              <Menu size={22} />
            </button>

            {/* Mobile brand: logo + name. Below 390px the name is dropped (the
                logo stays) so the row never has to truncate it. */}
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <img src="/logo.png" alt="ChombuTar" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              <h1 className="min-w-0 truncate text-left text-[17px] font-black tracking-tight min-[390px]:block">
                ChombuTar
              </h1>
            </div>

            {/* Desktop brand */}
            <div className="hidden min-w-0 md:flex">
              <BrandMark />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
            <div className="flex rounded-full bg-white border-[1.5px] border-black p-0.5 text-[11px] font-bold md:hidden">
              <button
                type="button"
                aria-pressed={browseRole === 'talent'}
                onClick={() => setBrowseRole('talent')}
                className={`px-2.5 py-1 rounded-full transition ${
                  browseRole === 'talent' ? 'bg-[#0A13E6] text-white' : 'text-black/55'
                }`}
              >
                Talent
              </button>
              <button
                type="button"
                aria-pressed={browseRole === 'client'}
                onClick={() => setBrowseRole('client')}
                className={`px-2.5 py-1 rounded-full transition ${
                  browseRole === 'client' ? 'bg-black text-white' : 'text-black/55'
                }`}
              >
                Client
              </button>
            </div>
            <Link
              to="/profile"
              aria-label="Profile"
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-black bg-[#0A13E6] text-[12px] font-black text-white md:h-10 md:w-10 md:text-[13px]"
            >
              {user?.avatarUrl ? (
                <img src={cldImage(user.avatarUrl, { w: 80, h: 80 })} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </Link>
          </div>
        </div>
      </header>

      <BottomNav />
      {location.pathname === '/deals' && <MyDealsModal />}

      <main
        className={`w-full transition-[padding] duration-200 ease-out ${collapsed ? 'md:pr-[72px]' : 'md:pr-[236px]'}`}
      >
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 pt-5 pb-[76px] md:pb-7 md:pt-[calc(64px+1.75rem)]">
          {children}
        </div>
      </main>
    </div>
  )
}

export function useBrowseRole() {
  const [role, setRole] = useState(() => localStorage.getItem('_role') || localStorage.getItem('chombutar_role') || 'talent')
  useEffect(() => {
    const onStorage = () => setRole(localStorage.getItem('_role') || localStorage.getItem('chombutar_role') || 'talent')
    window.addEventListener('storage', onStorage)
    const id = setInterval(onStorage, 400)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(id)
    }
  }, [])
  return role
}