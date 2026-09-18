// Path: src/lib/nav.js
// Single source of truth for the app's primary navigation. Built strictly
// from the routes already registered in App.jsx — no invented pages.
import {
  Home,
  Store,
  UserRound,
  PlusCircle,
  Briefcase,
  ClipboardList,
  CalendarCheck,
  Wallet as WalletIcon,
  MessageCircle,
  Radio,
} from 'lucide-react'

// Rendered in the sidebar's main nav list, and in the mobile drawer, in
// this order.
export const NAV_PRIMARY = [
  { to: '/', icon: Home, label: 'Feed', end: true },
  { to: '/showroom', icon: Store, label: 'Showroom' },
  { to: '/live', icon: Radio, label: 'Live' },
  { to: '/my-hats', icon: Briefcase, label: 'My Hats' },
  { to: '/my-applications', icon: ClipboardList, label: 'Applications' },
  { to: '/my-bookings', icon: CalendarCheck, label: 'Bookings' },
  { to: '/create', icon: PlusCircle, label: 'Create' },
]

// Rendered in a lighter "secondary" group, above the account area.
export const NAV_SECONDARY = [
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/wallet', icon: WalletIcon, label: 'Wallet' },
]

// Account-area link (kept out of NAV_PRIMARY/SECONDARY since it's rendered
// specially — with the user's avatar — at the bottom of the sidebar).
export const PROFILE_ITEM = { to: '/profile', icon: UserRound, label: 'Profile' }

// Longest-prefix match against the current pathname so /live/arena/:id
// still resolves to "Live" and /talent/:hatId resolves to "Talent Profile"
// even though neither is a literal nav entry.
const TITLES = [
  { test: (p) => p === '/', title: 'Feed' },
  { test: (p) => p.startsWith('/messages'), title: 'Messages' },
  { test: (p) => p.startsWith('/showroom'), title: 'Showroom' },
  { test: (p) => p.startsWith('/my-hats'), title: 'My Hats' },
  { test: (p) => p.startsWith('/create'), title: 'Create' },
  { test: (p) => p.startsWith('/my-applications'), title: 'Applications' },
  { test: (p) => p.startsWith('/my-bookings'), title: 'Bookings' },
  { test: (p) => p.startsWith('/wallet'), title: 'Wallet' },
  { test: (p) => p.startsWith('/live'), title: 'Live' },
  { test: (p) => p.startsWith('/admin'), title: 'Admin' },
  { test: (p) => p.startsWith('/talent/'), title: 'Talent Profile' },
  { test: (p) => p.startsWith('/profile'), title: 'Profile' },
  { test: (p) => p.startsWith('/auth'), title: 'Sign in' },
]

export function getPageTitle(pathname) {
  const match = TITLES.find((entry) => entry.test(pathname))
  return match ? match.title : 'ChombuTar'
}