// Path: src/App.jsx
import { Navigate, Route, Routes } from 'react-router-dom'
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
import MyApplications from './pages/MyApplications.jsx'
import MyBookings from './pages/MyBookings.jsx'
import Wallet from './pages/Wallet.jsx'
import Admin from './pages/Admin.jsx'
import Messages from './pages/Messages.jsx'
import LiveHub from './pages/Live/LiveHub.jsx'
import StageRoom from './pages/Live/StageRoom.jsx'

function FullPageSpinner() { return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div> }
function ProtectedRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Navigate to="/auth" replace />; return <Layout>{children}</Layout> }
function PublicOnlyRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (user) return <Navigate to="/" replace />; return children }
function AdminRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Navigate to="/auth" replace />; if (!user.isAdmin) return <Navigate to="/" replace />; return <Layout>{children}</Layout> }
function HomeRoute() { const { user, loading } = useAuth(); if (loading) return <FullPageSpinner />; if (!user) return <Landing />; return <Layout><Feed /></Layout> }

export default function App() {
  return <Routes>
    <Route path="/auth" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
    <Route path="/" element={<HomeRoute />} />
    <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
    <Route path="/showroom/:postId?" element={<ProtectedRoute><ShowroomPage /></ProtectedRoute>} />
    <Route path="/my-hats" element={<ProtectedRoute><MyHats /></ProtectedRoute>} />
    <Route path="/create" element={<ProtectedRoute><HatForm /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/profile/:username" element={<ProtectedRoute><PublicProfile /></ProtectedRoute>} />
    <Route path="/my-applications" element={<ProtectedRoute><MyApplications /></ProtectedRoute>} />
    <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
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
