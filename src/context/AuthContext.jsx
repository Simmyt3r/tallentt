// Path: src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true while we check for an existing session

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.register(payload)
    setUser(data.user)
    return data.user
  }, [])

  const login = useCallback(async (payload) => {
    const data = await api.login(payload)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (payload) => {
    const data = await api.updateProfile(payload)
    setUser(data.user)
    return data.user
  }, [])

  // Re-fetches the signed-in user — used after wallet actions (top-up,
  // withdraw, funding an escrow from the wallet) so user.walletBalance
  // reflects the new balance without a full page reload.
  const refreshUser = useCallback(async () => {
    try {
      const data = await api.me()
      setUser(data.user)
      return data.user
    } catch {
      return null
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}