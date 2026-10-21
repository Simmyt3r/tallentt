// Path: src/components/Layout.jsx
import { Link, useLocation } from 'react-router-dom'
import { Menu, Plus, MessageCircle, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DesktopSidebar, MobileDrawer, BrandMark } from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import PageTour from './PageTour.jsx'
import { useAuth } from '../context/AuthContext'
import { cldImage } from '../lib/cloudinary'
import NotificationsMenu from './NotificationsMenu.jsx'

// Facebook-style quick actions without any role-based browsing switch.
const MENU_BUTTON =
  'h-8 w-8 md:h-10 md:w-10 shrink-0 place-items-center rounded-full text-black transition-colors hover:bg-black/[0.06] active:bg-black/[0.1]'
const QUICK_ACTION =
  'relative h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-full border border-black/10 bg-white text-black/70 shadow-sm flex items-center justify-center transition-colors hover:bg-[#E7E9FF] hover:text-[#0A13E6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6]'

export default function Layout({ children }) {
  const location = useLocation()
  // Respect browser/device Back history. Do not unexpectedly redirect a
  // user to Showroom when they are returning to a previous major tab.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('chombutar_sidebar_collapsed') === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)

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
          Right : search, create, messages, alerts, then profile.
                  The discovery feed shows both Talent and Client Hats.
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

            {/* Keep the actual name visible on every route. Search belongs to Showroom. */}
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <img src="/logo.png" alt="ChombuTar" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              <h1 className="block whitespace-nowrap text-left text-[13px] min-[375px]:text-[16px] font-black tracking-tight">
                ChombuTar
              </h1>
            </div>

            {/* Desktop brand and full wordmark */}
            <div className="hidden min-w-0 md:flex items-center gap-2">
              <BrandMark />
              <Link to="/showroom" className="whitespace-nowrap text-[17px] font-black tracking-tight" aria-label="ChombuTar home">ChombuTar</Link>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 md:gap-2">
            <nav className="flex shrink-0 items-center gap-1 md:gap-2" aria-label="Quick actions">

              <Link to="/live" aria-label="Live" title="Watch live" className={QUICK_ACTION}>
                <Radio size={19} aria-hidden="true" />
              </Link>
              <Link to="/create" aria-label="Create Hat" title="Create Hat"
                className={`${QUICK_ACTION} hidden sm:flex`}>
                <Plus size={21} aria-hidden="true" />
              </Link>
              <Link to="/chats" aria-label="Open general chat" title="General chat, not restricted to deals"
                className={QUICK_ACTION}>
                <MessageCircle size={20} aria-hidden="true" />
              </Link>
              <NotificationsMenu className="flex"
                buttonClassName={QUICK_ACTION} iconSize={19} />
            </nav>
            <Link
              to="/profile"
              aria-label="Profile"
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-black bg-[#0A13E6] text-[12px] font-black text-white md:h-10 md:w-10 md:text-[13px]"
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
      <PageTour />

      <main
        className={`w-full transition-[padding] duration-200 ease-out ${collapsed ? 'md:pl-[72px]' : 'md:pl-[236px]'}`}
      >
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 pt-5 pb-[76px] md:pb-7 md:pt-[calc(64px+1.75rem)]">
          {children}
        </div>
      </main>
    </div>
  )
}

