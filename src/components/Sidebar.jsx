// Path: src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { NAV_PRIMARY, NAV_SECONDARY } from '../lib/nav'
import NotificationsMenu from './NotificationsMenu.jsx'

function fmtMoney(n) {
  if (n == null) return '₦0'
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n).toLocaleString()}`
  }
}

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
        <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
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
function SidebarContent({ collapsed, onNavigate, browseRole, setBrowseRole }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    onNavigate?.()
    navigate('/auth')
  }

  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-visible px-2.5 py-3 space-y-5">
        {!collapsed && (
          <div className="px-1">
            <div className="flex rounded-full bg-black/[0.05] p-0.5 text-[11px] font-bold">
              <button
                type="button"
                aria-pressed={browseRole === 'talent'}
                onClick={() => setBrowseRole('talent')}
                className={`flex-1 px-2 py-1.5 rounded-full transition ${
                  browseRole === 'talent' ? 'bg-[#0A13E6] text-white shadow-sm' : 'text-black/55 hover:text-black'
                }`}
              >
                Talent
              </button>
              <button
                type="button"
                aria-pressed={browseRole === 'client'}
                onClick={() => setBrowseRole('client')}
                className={`flex-1 px-2 py-1.5 rounded-full transition ${
                  browseRole === 'client' ? 'bg-black text-white shadow-sm' : 'text-black/55 hover:text-black'
                }`}
              >
                Client
              </button>
            </div>
            <p className="mt-1.5 px-0.5 text-[10.5px] leading-snug text-black/40 font-medium">
              {browseRole === 'talent' ? 'Browsing as Talent → viewing Client cards' : 'Browsing as Client → viewing Talent cards'}
            </p>
          </div>
        )}

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
                <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-50">
                  Admin
                </span>
              )}
            </NavLink>
          )}
        </div>
      </nav>

      <div className="border-t border-black/10 px-2.5 py-3 space-y-1">
        <div className="px-1 mb-1">
          <NotificationsMenu />
        </div>
        <NavLink
          to="/profile"
          onClick={onNavigate}
          title={collapsed ? 'Profile' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-[12px] px-2 py-2 transition-colors ${
              collapsed ? 'justify-center' : ''
            } ${isActive ? 'bg-black/[0.06]' : 'hover:bg-black/[0.05]'}`
          }
        >
          <span className="w-8 h-8 shrink-0 rounded-full bg-[#0A13E6] text-white grid place-items-center text-[12px] font-black">
            {(user?.name || user?.fullName || 'U').slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-bold text-black">{user?.name || user?.fullName || 'Profile'}</span>
              <span className="block truncate text-[11px] font-semibold text-black/45">{fmtMoney(user?.walletBalance)}</span>
            </span>
          )}
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className={`flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-[13.5px] font-semibold text-black/55 transition-colors hover:bg-red-50 hover:text-red-600 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </>
  )
}

// Small persistent brand mark, shown independently of the sidebar now that
// the sidebar lives on the right. Rendered by Layout on the opposite
// (left) side of the screen on desktop.
export function BrandMark({ className = '' }) {
  return (
    <NavLink to="/" className={`flex items-center gap-2 min-w-0 ${className}`} aria-label="ChombuTar home">
      <img src="/logo.png" alt="ChombuTar" className="w-9 h-9 object-contain shrink-0" />
      <span className="truncate text-[15px] font-black tracking-tight">ChombuTar</span>
    </NavLink>
  )
}

export function DesktopSidebar({ collapsed, onToggleCollapsed, browseRole, setBrowseRole }) {
  return (
    <aside
      className={`hidden md:flex fixed inset-y-0 right-0 z-30 flex-col border-l-[1.5px] border-black bg-[#FAFAF8] transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[72px]' : 'w-[236px]'
      }`}
    >
      <div className={`flex items-center h-16 shrink-0 border-b border-black/10 px-3 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-7 h-7 shrink-0 rounded-full border border-black/10 grid place-items-center text-black/50 hover:bg-black/[0.06] hover:text-black transition"
        >
          {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      <SidebarContent collapsed={collapsed} browseRole={browseRole} setBrowseRole={setBrowseRole} />
    </aside>
  )
}

export function MobileDrawer({ open, onClose, browseRole, setBrowseRole }) {
  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`md:hidden fixed inset-y-0 right-0 z-50 flex w-[82%] max-w-[300px] flex-col bg-[#FAFAF8] border-l-[1.5px] border-black transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 shrink-0 border-b border-black/10 px-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ChombuTar" className="w-9 h-9 object-contain" />
            <span className="text-[15px] font-black tracking-tight">ChombuTar</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 rounded-full border border-black/10 grid place-items-center text-black/60 hover:bg-black/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
        <SidebarContent collapsed={false} onNavigate={onClose} browseRole={browseRole} setBrowseRole={setBrowseRole} />
      </aside>
    </>
  )
}