// Path: src/lib/nav.js
import {
  Home,
  Store,
  UserRound,
  PlusCircle,
  Briefcase,
  Handshake,
  Wallet as WalletIcon,
  MessageCircle,
  Radio,
} from 'lucide-react'

export const NAV_PRIMARY = [
  { to: '/', icon: Home, label: 'Feed', end: true },
  { to: '/showroom', icon: Store, label: 'Showroom' },
  { to: '/deals', icon: Handshake, label: 'My Deals' },
  { to: '/live', icon: Radio, label: 'Live' },
  { to: '/my-hats', icon: Briefcase, label: 'My Hats' },
  { to: '/create', icon: PlusCircle, label: 'Create' },
]

export const NAV_SECONDARY = [
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/wallet', icon: WalletIcon, label: 'Wallet' },
]

export const PROFILE_ITEM = { to: '/profile', icon: UserRound, label: 'Profile' }

const TITLES = [
  { test: (p) => p === '/', title: 'Feed' },
  { test: (p) => p.startsWith('/messages'), title: 'Messages' },
  { test: (p) => p.startsWith('/showroom'), title: 'Showroom' },
  { test: (p) => p.startsWith('/deals'), title: 'My Deals' },
  { test: (p) => p.startsWith('/my-hats'), title: 'My Hats' },
  { test: (p) => p.startsWith('/create'), title: 'Create' },
  { test: (p) => p.startsWith('/my-applications'), title: 'My Deals' },
  { test: (p) => p.startsWith('/my-bookings'), title: 'My Deals' },
  { test: (p) => p.startsWith('/wallet'), title: 'Wallet' },
  { test: (p) => p.startsWith('/live'), title: 'Go Live' },
  { test: (p) => p.startsWith('/admin'), title: 'Admin' },
  { test: (p) => p.startsWith('/talent/'), title: 'Talent Profile' },
  { test: (p) => p.startsWith('/profile'), title: 'Profile' },
  { test: (p) => p.startsWith('/auth'), title: 'Sign in' },
]

export function getPageTitle(pathname) {
  const match = TITLES.find((entry) => entry.test(pathname))
  return match ? match.title : 'ChombuTar'
}
