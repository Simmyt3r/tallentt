// Path: src/components/Layout.jsx
import { Link, useLocation } from 'react-router-dom'
import { Menu, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DesktopSidebar, MobileDrawer } from './Sidebar.jsx'
import NotificationsMenu from './NotificationsMenu.jsx'
import { getPageTitle } from '../lib/nav'

export default function Layout({ children }) {
  const location = useLocation()
  const [browseRole, setBrowseRole] = useState(() => localStorage.getItem('chombutar_role') || 'talent')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('chombutar_sidebar_collapsed') === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
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

  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="min-h-screen bg-[#F7F3EB] text-black antialiased">
      <DesktopSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        browseRole={browseRole}
        setBrowseRole={setBrowseRole}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        browseRole={browseRole}
        setBrowseRole={setBrowseRole}
      />

      {/* Mobile top header — Menu | Page title | quick actions */}
      <header className="md:hidden sticky top-0 z-20 bg-[#F7F3EB]/95 backdrop-blur-xl border-b-[1.5px] border-black">
        <div className="h-14 px-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="w-9 h-9 shrink-0 rounded-full bg-white border-[1.5px] border-black flex items-center justify-center"
          >
            <Menu size={17} />
          </button>
          <h1 className="flex-1 min-w-0 truncate text-center text-[15px] font-black tracking-tight">{pageTitle}</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/messages"
              title="Messages"
              aria-label="Messages"
              className="w-9 h-9 rounded-full bg-white border-[1.5px] border-black flex items-center justify-center"
            >
              <MessageCircle size={16} />
            </Link>
            <NotificationsMenu />
          </div>
        </div>
      </header>

      <main
        className={`w-full transition-[padding] duration-200 ease-out ${collapsed ? 'md:pl-[72px]' : 'md:pl-[236px]'}`}
      >
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-5 md:py-7">{children}</div>
      </main>
    </div>
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