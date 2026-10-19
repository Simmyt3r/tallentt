// Path: src/lib/nav.js
import {
  House,
  LayoutGrid,
  MessageSquareHeart,
  UserRound,
  PlusCircle,
  Briefcase,
  Handshake,
  Wallet as WalletIcon,
  MessageCircle,
  ArrowLeftRight,
  Scale,
  Radio,
  Settings2,
} from 'lucide-react'

export const NAV_PRIMARY = [
  { to: '/showroom', icon: House, label: 'Showroom' },
  { to: '/bento', icon: LayoutGrid, label: 'Bento' },
  { to: '/vibes', icon: MessageSquareHeart, label: 'Vibes' },
  { to: '/my-hats', icon: Briefcase, label: 'My Hats' },
  { to: '/deals', icon: Handshake, label: 'My Deals' },
  { to: '/live', icon: Radio, label: 'Live' },
  { to: '/create', icon: PlusCircle, label: 'Create' },
]

export const NAV_SECONDARY = [
  { to: '/negotiations', icon: ArrowLeftRight, label: 'Negotiation Center' },
  { to: '/chats', icon: MessageCircle, label: 'General Chat' },
  { to: '/messages', icon: MessageCircle, label: 'Deals Chat' },
  { to: '/wallet', icon: WalletIcon, label: 'Wallet' },
  { to: '/disputes', icon: Scale, label: 'Dispute Center' },
  { to: '/settings', icon: Settings2, label: 'Settings' },
]

export const PROFILE_ITEM = { to: '/profile', icon: UserRound, label: 'Profile' }

const TITLES = [
  { test: (p) => p === '/', title: 'Showroom' },
  { test: (p) => p === '/bento', title: 'Bento Feed' },
  { test: (p) => p.startsWith('/vibes'), title: 'Hits & Vibes' },
  { test: (p) => p.startsWith('/chats'), title: 'General Chat' },
  { test: (p) => p.startsWith('/messages'), title: 'Deals Chat' },
  { test: (p) => p.startsWith('/negotiations'), title: 'Negotiation Center' },
  { test: (p) => p.startsWith('/notifications'), title: 'Notifications' },
  { test: (p) => p.startsWith('/showroom'), title: 'Showroom' },
  { test: (p) => p.startsWith('/deals'), title: 'My Deals' },
  { test: (p) => p.startsWith('/my-hats'), title: 'My Hats' },
  { test: (p) => p.startsWith('/create'), title: 'Create' },
  { test: (p) => p.startsWith('/my-applications'), title: 'My Deals' },
  { test: (p) => p.startsWith('/my-bookings'), title: 'My Deals' },
  { test: (p) => p.startsWith('/wallet'), title: 'Wallet' },
  { test: (p) => p.startsWith('/settings'), title: 'Settings' },
  { test: (p) => p.startsWith('/disputes'), title: 'Dispute Center' },
  { test: (p) => p.startsWith('/live/competitions'), title: 'Stage Competitions' },
  { test: (p) => p.startsWith('/live'), title: 'Live Broadcast' },
  { test: (p) => p.startsWith('/admin'), title: 'Admin' },
  { test: (p) => p.startsWith('/talent/'), title: 'Talent Profile' },
  { test: (p) => p.startsWith('/profile'), title: 'Profile' },
  { test: (p) => p.startsWith('/auth'), title: 'Sign in' },
]

export function getPageTitle(pathname) {
  const match = TITLES.find((entry) => entry.test(pathname))
  return match ? match.title : 'ChombuTar'
}
