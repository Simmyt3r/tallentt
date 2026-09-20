// Path: src/pages/Profile.jsx
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProfileView from '../components/profile/ProfileView.jsx'
import EditProfileForm from '../components/profile/EditProfileForm.jsx'

const EMPTY_DATA = { portfolio: [], hats: { talent: [], client: [] }, isVerified: false, rating: 0, ratedHatsCount: 0 }

export default function Profile() {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(EMPTY_DATA)

  const load = useCallback(async (username) => {
    setLoading(true)
    try {
      const res = await api.getUserProfile(username)
      setData({
        portfolio: res.portfolio || [],
        hats: res.hats || { talent: [], client: [] },
        isVerified: !!res.isVerified,
        rating: res.rating || 0,
        ratedHatsCount: res.ratedHatsCount || 0,
      })
    } catch (err) {
      // Own profile should never genuinely 404 — degrade to an empty
      // Portfolio/Hats/Reviews state rather than crashing the page; the
      // identity half of the page still renders fine from AuthContext.
      console.error('Failed to load profile data:', err)
      setData(EMPTY_DATA)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.username) load(user.username)
  }, [user?.username, load])

  if (!user) return null

  if (editing) {
    return (
      <EditProfileForm
        user={user}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    )
  }

  return (
    <ProfileView
      status={loading ? 'loading' : 'ready'}
      isOwner
      profileUser={user}
      portfolio={data.portfolio}
      hats={data.hats}
      isVerified={data.isVerified}
      rating={data.rating}
      ratedHatsCount={data.ratedHatsCount}
      onEditClick={() => setEditing(true)}
    />
  )
}
