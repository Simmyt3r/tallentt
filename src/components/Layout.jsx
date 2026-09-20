// Path: src/components/Layout.jsx
import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DesktopSidebar, MobileDrawer, BrandMark } from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import { useAuth } from '../context/AuthContext'
import { cldImage } from '../lib/cloudinary'

export default function Layout({ children }) {
  const location = useLocation()
  const { user } = useAuth()
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

  const initial = (user?.name || user?.fullName || 'U').slice(0, 1).toUpperCase()

  return (
    <div className="min-h-screen bg-[#F7F3EB] text-black antialiased">
      <DesktopSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Persistent top strip carrying the brand mark on the left — sits
          opposite the sidebar now that the sidebar has moved to the right
          edge of the screen. The sidebar (z-30) draws over its right end. */}
      <div className="hidden md:flex fixed top-0 inset-x-0 z-20 h-16 items-center px-4 bg-[#F7F3EB]/95 backdrop-blur-xl border-b-[1.5px] border-black">
        <BrandMark />
      </div>

      {/* Mobile top header — Logo | ChombuTar | Talent/Client toggle + avatar
          (the avatar opens the drawer, mirroring the sidebar's account row,
          and sits on the right — the same side the sidebar itself lives on). */}
      <header className="md:hidden sticky top-0 z-20 bg-[#F7F3EB]/95 backdrop-blur-xl border-b-[1.5px] border-black">
        <div className="h-14 px-3 flex items-center justify-between gap-2">
          <img
            src="/logo.png"
            alt="ChombuTar"
            className="h-12.5 w-12.5 rounded-full border-[0px] border-black object-cover shrink-0"
          />
          <h1 className="flex-1 min-w-0 truncate text-left text-[20px] font-black tracking-tight">ChombuTar</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex rounded-full bg-white border-[1.5px] border-black p-0.5 text-[11px] font-bold">
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
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="w-9 h-9 shrink-0 rounded-full border-[1.5px] border-black overflow-hidden flex items-center justify-center bg-[#0A13E6] text-white text-[12px] font-black"
            >
              {user?.avatarUrl ? (
                <img src={cldImage(user.avatarUrl, { w: 72, h: 72 })} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </button>
          </div>
        </div>
      </header>

      <BottomNav />

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