// Path: src/App.jsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Landing from './pages/Landing.jsx'
import Layout from './components/Layout.jsx'
import Feed from './pages/Feed.jsx'
import ShowroomPage from './pages/ShowroomPage.jsx'
import MyHats from './components/MyHats.jsx'
import HatForm from './components/HatForm.jsx'
import Profile from './pages/Profile.jsx'
import TalentProfile from './pages/TalentProfile.jsx'
import MyApplications from './pages/MyApplications.jsx'
import MyBookings from './pages/MyBookings.jsx'

function FullPageSpinner() {
  return (
    <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/auth" replace />
  return <Layout>{children}</Layout>
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to="/" replace />
  return children
}

function HomeRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Landing />
  return (
    <Layout>
      <Feed />
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <PublicOnlyRoute>
            <AuthPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/showroom"
        element={
          <ProtectedRoute>
            <ShowroomPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-hats"
        element={
          <ProtectedRoute>
            <MyHats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <HatForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-applications"
        element={
          <ProtectedRoute>
            <MyApplications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <ProtectedRoute>
            <MyBookings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/talent/:hatId"
        element={
          <ProtectedRoute>
            <TalentProfile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}