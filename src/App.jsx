// Path: src/App.jsx
import { Component } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Landing from './pages/Landing.jsx'
import Layout from './components/Layout.jsx'
import Feed from './pages/Feed.jsx'
import Vibes from './pages/Vibes.jsx'
import HatPage from './pages/HatPage.jsx'
import PublicProfile from './pages/PublicProfile.jsx'
import ShowroomPage from './pages/ShowroomPage.jsx'
import MyHats from './components/MyHats.jsx'
import HatForm from './components/HatForm.jsx'
import Profile from './pages/Profile.jsx'
import TalentProfile from './pages/TalentProfile.jsx'
import Wallet from './pages/Wallet.jsx'
import Admin from './pages/Admin.jsx'
import Inbox from './pages/Inbox.jsx'
import Negotiations from './pages/Negotiations.jsx'
import Notifications from './pages/Notifications.jsx'
import Settings from './pages/Settings.jsx'
import Billing from './pages/Billing.jsx'
import MyDeals from './pages/MyDeals.jsx'
import DealDetails from './pages/DealDetails.jsx'
import VerifyWorkPass from './pages/VerifyWorkPass.jsx'
import DisputeCenter from './pages/DisputeCenter.jsx'
import LiveHub from './pages/Live/LiveHub.jsx'
import StageRoom from './pages/Live/StageRoom.jsx'
import StageCompetitions from './pages/Live/StageCompetitions.jsx'
import StageCompetitionRoom from './pages/Live/StageCompetitionRoom.jsx'
import { decideLanding } from './lib/landing.js'
import { safeVibeReturnPath } from './lib/vibeSharing.js'

function LegacyInboxRedirect({ tab }) { const { search } = useLocation(); const params = new URLSearchParams(search); params.set('tab', tab); return <Navigate to={'/inbox?' + params.toString()} replace /> }

// Contain unexpected Vibes render exceptions rather than blanking the entire
// app. This also gives older PWA clients a clear reload action on recovery.
class VibesRenderBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) {
    console.error('Vibes render failed:', error, info?.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main role="alert" className="mx-auto my-10 max-w-[540px] rounded-2xl border border-[#CDD3FF] bg-white p-6 shadow-sm">
      <h1 className="text-lg font-black text-[#12183E]">Vibes couldn't open</h1>
      <p className="mt-2 text-sm text-black/65">There was a problem displaying Vibes. Your posts and comments are still stored. Refresh to load the latest version.</p>
      <button type="button" onClick={() => window.location.reload()}
        className="mt-4 min-h-11 rounded-full bg-[#0A13E6] px-6 text-sm font-bold text-white">
        Reload Vibes
      </button>
    </main>
  }
}
function FullPageSpinner() { return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div> }
function ProtectedRoute({ children }) {
  const { user,loading }=useAuth()
  const location=useLocation()
  if(loading)return <FullPageSpinner />
  if(!user){
    const next=safeVibeReturnPath(location.pathname+location.search)
    return <Navigate to={next?'/auth?next='+encodeURIComponent(next):'/auth'} replace />
  }
  return <Layout>{children}</Layout>
}
function PublicOnlyRoute({ children }) {
  const {user,loading}=useAuth()
  const location=useLocation()
  if(loading)return <FullPageSpinner />
  if(user){
    const next=safeVibeReturnPath(new URLSearchParams(location.search).get('next'))
    return <Navigate to={next||'/'} replace />
  }
  return children
}
function AdminRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Navigate to="/auth" replace />; if (!user.isAdmin) return <Navigate to="/" replace />; return <Layout>{children}</Layout> }
// The homepage is always Showroom for every signed-in account.
function HomeRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Landing />
  return <Navigate to={decideLanding()} replace />
}

export default function App() {
  return <Routes>
    <Route path="/auth" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
    <Route path="/" element={<HomeRoute />} />
    <Route path="/bento" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
    <Route path="/vibes" element={<ProtectedRoute><VibesRenderBoundary><Vibes /></VibesRenderBoundary></ProtectedRoute>} />
    <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
    <Route path="/messages" element={<LegacyInboxRedirect tab="bento" />} />
    <Route path="/chats" element={<LegacyInboxRedirect tab="associates" />} />
    <Route path="/negotiations" element={<ProtectedRoute><Negotiations /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/showroom/:postId?" element={<ProtectedRoute><ShowroomPage /></ProtectedRoute>} />
    <Route path="/my-hats" element={<ProtectedRoute><MyHats /></ProtectedRoute>} />
    <Route path="/create" element={<ProtectedRoute><HatForm /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/profile/:username" element={<ProtectedRoute><PublicProfile /></ProtectedRoute>} />
    <Route path="/work-pass/verify" element={<ProtectedRoute><VerifyWorkPass /></ProtectedRoute>} />
    <Route path="/deals" element={<ProtectedRoute><MyDeals /></ProtectedRoute>} />
    <Route path="/deals/:dealId" element={<ProtectedRoute><DealDetails /></ProtectedRoute>} />
    <Route path="/my-applications" element={<Navigate to="/deals?role=talent&tab=outgoing" replace />} />
    <Route path="/my-bookings" element={<Navigate to="/deals?role=client&tab=outgoing" replace />} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
    <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
    <Route path="/disputes" element={<ProtectedRoute><DisputeCenter /></ProtectedRoute>} />
    <Route path="/live" element={<ProtectedRoute><LiveHub /></ProtectedRoute>} />
    <Route path="/live/stage/:id" element={<ProtectedRoute><StageRoom /></ProtectedRoute>} />
    <Route path="/live/competitions" element={<ProtectedRoute><StageCompetitions /></ProtectedRoute>} />
    <Route path="/live/competitions/:id" element={<ProtectedRoute><StageCompetitionRoom /></ProtectedRoute>} />
    <Route path="/live/stage" element={<Navigate to="/live" replace />} />
    <Route path="/live/arena/:id?" element={<Navigate to="/live" replace />} />
    <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
    <Route path="/talent/:hatId" element={<ProtectedRoute><TalentProfile /></ProtectedRoute>} />
    <Route path="/hat/:hatId" element={<ProtectedRoute><HatPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
