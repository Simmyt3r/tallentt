// Path: src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import WorkPassNavIcon from './WorkPassNavIcon.jsx'
import { NAV_PRIMARY, NAV_SECONDARY } from '../lib/nav'

function SidebarLink({ to, icon: Icon, label, end, collapsed, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-[#0A13E6] text-white'
            : 'text-black/65 hover:bg-black/[0.05] hover:text-black'
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
          {label}
        </span>
      )}
    </NavLink>
  )
}

/**
 * Shared nav content rendered by both the fixed desktop sidebar and the
 * mobile drawer, so the two never drift out of sync.
 */
function SidebarContent({ collapsed, onNavigate }) {
  const { user } = useAuth()

  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-visible px-2.5 py-3 space-y-5">
        <div className="space-y-1">
          {!collapsed && <p className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-widest text-black/35">Menu</p>}
          {NAV_PRIMARY.map((item) => (
            <SidebarLink key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="space-y-1">
          {!collapsed && <p className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-widest text-black/35">More</p>}
          {NAV_SECONDARY.map((item) => (
            <SidebarLink key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
          {user?.isAdmin && (
            <NavLink
              to="/admin"
              onClick={onNavigate}
              title={collapsed ? 'Admin' : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${isActive ? 'bg-black text-white' : 'text-black/65 hover:bg-black/[0.05] hover:text-black'}`
              }
            >
              <ShieldCheck size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">Admin</span>}
              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
                  Admin
                </span>
              )}
            </NavLink>
          )}
        </div>
      </nav>

    </>
  )
}

// Small persistent brand mark rendered in the header beside the menu control.
// The logo graphic already carries
// the "ChombuTar" wordmark, so no separate text label is rendered next to
// it — that was redundant and crowded any title sitting near it.
export function BrandMark({ className = '' }) {
  return (
    <NavLink to="/" className={`flex items-center min-w-0 ${className}`} aria-label="ChombuTar home">
      <img src="/logo.png" alt="ChombuTar" className="h-12 w-12 rounded-full border-[1.5px] border-black object-cover shrink-0" />
    </NavLink>
  )
}

export function DesktopSidebar({ collapsed, onOpenWorkPass }) {
  // Sits directly under the fixed header (h-16); the header's menu button
  // collapses/expands it.
  return (
    <aside
      id="desktop-sidebar"
      className={`hidden md:flex fixed top-16 bottom-0 left-0 z-30 flex-col border-r-[1.5px] border-black bg-[#FAFAF8] transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[72px]' : 'w-[236px]'
      }`}
    >
      <SidebarContent collapsed={collapsed} />
      <div className="shrink-0 border-t border-black/10 p-2.5">
        <button type="button" onClick={onOpenWorkPass} title="Open my Work Pass"
          aria-label="Open my Work Pass"
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#D9DFFA] bg-[#E9ECFF] px-3 font-bold text-[#0A13E6] hover:bg-[#DDE3FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A13E6] ${collapsed?'justify-center':''}`}>
          <WorkPassNavIcon size={23} className="shrink-0" />
          {!collapsed && <span className="text-[12px]">My Work Pass</span>}
        </button>
      </div>
    </aside>
  )
}

export function MobileDrawer({ open, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
        className={`md:hidden fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[300px] flex-col bg-[#FAFAF8] border-r-[1.5px] border-black transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-start h-16 shrink-0 border-b border-black/10 px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 rounded-full border border-black/10 grid place-items-center text-black/60 hover:bg-black/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
        <SidebarContent collapsed={false} onNavigate={onClose} />
      </aside>
    </>
  )
}