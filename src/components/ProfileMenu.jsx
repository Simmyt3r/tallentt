import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BadgeCheck, ChevronDown, LogOut, Settings2, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { cldImage } from '../lib/cloudinary.js'

// The top avatar is the sole place for profile and account navigation.
// Work Pass intentionally lives in the persistent navigation, not this menu.
const ITEMS = [
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/settings', label: 'Account settings', icon: Settings2 },
  { to: '/billing', label: 'My plans', icon: BadgeCheck },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
]
export default function ProfileMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    if (!open) return undefined
    function outside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onFocus(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setError('')
    try {
      await logout()
      setOpen(false)
      navigate('/auth', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not sign out. Try again.')
    } finally {
      setSigningOut(false)
    }
  }

  const displayName = user?.name || user?.fullName || user?.username || 'My account'
  const initial = displayName.slice(0, 1).toUpperCase()
  return <div ref={rootRef} className="relative shrink-0">
    <button ref={triggerRef} type="button"
      aria-label="Open profile menu" title="Profile and account"
      aria-haspopup="true" aria-expanded={open} aria-controls="header-profile-menu"
      onClick={() => { setError(''); setOpen(value => !value) }}
      className="flex h-9 w-9 shrink-0 items-center gap-0.5 rounded-full border-2 border-[#0A13E6] bg-[#0A13E6] text-[12px] font-black text-white outline-offset-2 transition hover:ring-2 hover:ring-[#0A13E6]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0A13E6] md:h-10 md:w-[54px]">
      <span className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full md:h-9 md:w-9">
        {user?.avatarUrl ? <img src={cldImage(user.avatarUrl, { w: 80, h: 80 })}
          alt="" className="h-full w-full object-cover" /> : initial}
      </span>
      <ChevronDown size={11} className="mr-0.5 hidden text-white/80 md:block" aria-hidden="true"/>
    </button>
    {open && <nav id="header-profile-menu" aria-label="Profile and account"
      className="absolute right-0 top-[calc(100%+12px)] z-[80] w-[min(310px,calc(100vw-24px))] overflow-hidden rounded-[20px] border border-[#D9DFF9] bg-white shadow-[0_24px_65px_-22px_rgba(10,19,230,.5)]">
      <div className="border-b border-[#E4E6F3] bg-[#F7F3EB] p-4">
        <p className="truncate text-[14px] font-black text-[#101735]">{displayName}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-[#5B6387]">{user?.username ? '@'+user.username : 'ChombuTar account'}</p>
      </div>
      <div className="space-y-1 p-2">
        {ITEMS.map(({to,label,icon:Icon}) => <Link key={to} to={to}
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[12px] font-bold text-[#192142] hover:bg-[#EEF0FF] hover:text-[#0A13E6] focus-visible:bg-[#EEF0FF]">
          <Icon size={17} aria-hidden="true" className="shrink-0 text-[#0A13E6]"/>
          {label}
        </Link>)}
      </div>
      <div className="border-t border-[#E4E6F3] p-2">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
        <button type="button" onClick={signOut} disabled={signingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
          <LogOut size={17} aria-hidden="true"/>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </nav>}
  </div>
}
