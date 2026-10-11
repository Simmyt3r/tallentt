// Path: src/App.jsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Landing from './pages/Landing.jsx'
import Layout from './components/Layout.jsx'
import Feed from './pages/Feed.jsx'
import HatPage from './pages/HatPage.jsx'
import PublicProfile from './pages/PublicProfile.jsx'
import ShowroomPage from './pages/ShowroomPage.jsx'
import MyHats from './components/MyHats.jsx'
import HatForm from './components/HatForm.jsx'
import Profile from './pages/Profile.jsx'
import TalentProfile from './pages/TalentProfile.jsx'
import Wallet from './pages/Wallet.jsx'
import Admin from './pages/Admin.jsx'
import Messages from './pages/Messages.jsx'
import Negotiations from './pages/Negotiations.jsx'
import Notifications from './pages/Notifications.jsx'
import MyDeals from './pages/MyDeals.jsx'
import DealDetails from './pages/DealDetails.jsx'
import LiveHub from './pages/Live/LiveHub.jsx'
import StageRoom from './pages/Live/StageRoom.jsx'
import { api } from './lib/api.js'
import { decideLanding, landingPreferenceKey } from './lib/landing.js'

function FullPageSpinner() { return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div> }
function ProtectedRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Navigate to="/auth" replace />; return <Layout>{children}</Layout> }
function PublicOnlyRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (user) return <Navigate to="/" replace />; return children }
function AdminRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Navigate to="/auth" replace />; if (!user.isAdmin) return <Navigate to="/" replace />; return <Layout>{children}</Layout> }
function HomeRoute() {
  const { user, loading } = useAuth()
  const [destination, setDestination] = useState(null)
  useEffect(() => {
    if (!user?.id) {
      setDestination(null)
      return undefined
    }
    let cancelled = false
    const remembered = localStorage.getItem(landingPreferenceKey(user.id))
    // A deliberate selection is instant; only new sessions need a lightweight check.
    if (remembered === 'showroom' || remembered === 'bento') {
      setDestination(decideLanding({ remembered, role: user.role }))
      return undefined
    }
    api.getLandingContext()
      .then((context) => {
        if (!cancelled) setDestination(decideLanding({ role: user.role, hasActiveClientDeals: context.hasActiveClientDeals }))
      })
      .catch(() => {
        if (!cancelled) setDestination(decideLanding({ role: user.role }))
      })
    return () => { cancelled = true }
  }, [user?.id, user?.role])
  if (loading) return <FullPageSpinner />
  if (!user) return <Landing />
  if (!destination) return <FullPageSpinner />
  return <Navigate to={destination} replace />
}

export default function App() {
  return <Routes>
    <Route path="/auth" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
    <Route path="/" element={<HomeRoute />} />
    <Route path="/bento" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
    <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
    <Route path="/negotiations" element={<ProtectedRoute><Negotiations /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/showroom/:postId?" element={<ProtectedRoute><ShowroomPage /></ProtectedRoute>} />
    <Route path="/my-hats" element={<ProtectedRoute><MyHats /></ProtectedRoute>} />
    <Route path="/create" element={<ProtectedRoute><HatForm /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/profile/:username" element={<ProtectedRoute><PublicProfile /></ProtectedRoute>} />
    <Route path="/deals" element={<ProtectedRoute><MyDeals /></ProtectedRoute>} />
    <Route path="/deals/:dealId" element={<ProtectedRoute><DealDetails /></ProtectedRoute>} />
    <Route path="/my-applications" element={<Navigate to="/deals?role=talent&tab=outgoing" replace />} />
    <Route path="/my-bookings" element={<Navigate to="/deals?role=client&tab=outgoing" replace />} />
    <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
    <Route path="/live" element={<ProtectedRoute><LiveHub /></ProtectedRoute>} />
    <Route path="/live/stage/:id" element={<ProtectedRoute><StageRoom /></ProtectedRoute>} />
    <Route path="/live/stage" element={<Navigate to="/live" replace />} />
    <Route path="/live/arena/:id?" element={<Navigate to="/live" replace />} />
    <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
    <Route path="/talent/:hatId" element={<ProtectedRoute><TalentProfile /></ProtectedRoute>} />
    <Route path="/hat/:hatId" element={<ProtectedRoute><HatPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
