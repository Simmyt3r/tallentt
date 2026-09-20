// Path: src/pages/PublicProfile.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import ProfileView from '../components/profile/ProfileView.jsx'
import EditProfileForm from '../components/profile/EditProfileForm.jsx'

export default function PublicProfile() {
  const { username } = useParams()
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // loading | not-found | ready
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)

  const isOwnUsername = !!user && user.username?.toLowerCase() === username?.toLowerCase()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setEditing(false)
    if (!username) {
      setStatus('not-found')
      return
    }
    api
      .getUserProfile(username)
      .then((res) => {
        if (cancelled) return
        setProfile(res)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load public profile:', err)
        setStatus('not-found')
      })
    return () => {
      cancelled = true
    }
  }, [username])

  if (status === 'ready' && isOwnUsername && editing) {
    return (
      <EditProfileForm
        user={user}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    )
  }

  // Visiting your own shared profile link shows the same identity data
  // AuthContext already has (freshest right after an edit) instead of the
  // just-fetched copy, with owner controls enabled.
  const profileUser = status === 'ready' ? (isOwnUsername ? user : profile.user) : null

  return (
    <ProfileView
      status={status}
      isOwner={isOwnUsername}
      profileUser={profileUser}
      portfolio={profile?.portfolio}
      hats={profile?.hats}
      isVerified={profile?.isVerified}
      rating={profile?.rating}
      ratedHatsCount={profile?.ratedHatsCount}
      onEditClick={() => setEditing(true)}
    />
  )
}
