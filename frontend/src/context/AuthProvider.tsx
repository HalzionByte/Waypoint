import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError, api } from '../api/client'
import { setUnauthorizedHandler } from '../lib/http'
import { AuthContext } from './authContext'
import type { AuthValue, Credentials, Registration } from './authContext'
import type { User } from '../api/types'

/**
 * Holds the session.
 *
 * On boot the stored token is exchanged for the account via `/auth/me`, so a
 * token that has expired or been revoked drops the app to signed-out instead of
 * letting every screen fail one request at a time.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    api
      .me()
      .then((account) => {
        if (!cancelled) setUser(account)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // A 401 is the ordinary "not signed in" answer, not a failure worth
        // showing. Anything else means we could not reach the API at all, which
        // the user does need to know about.
        if (err instanceof ApiError && err.status === 401) return
        setError(
          err instanceof Error
            ? err.message
            : 'Could not reach the WayPoint server. Check your connection and reload.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // A token rejected mid-session (expired, or revoked server-side) should drop
  // straight to signed-out rather than leaving a half-broken UI on screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const adopt = useCallback((account: User) => {
    setUser(account)
    setError('')
    return account
  }, [])

  const login = useCallback(
    (credentials: Credentials) => api.login(credentials.email, credentials.password).then(adopt),
    [adopt],
  )

  const register = useCallback(
    (input: Registration) =>
      api.register({ name: input.name, email: input.email, password: input.password }).then(
        adopt,
      ),
    [adopt],
  )

  const demoLogin = useCallback(() => api.demoLogin().then(adopt), [adopt])

  const logout = useCallback(() => {
    api.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, error, login, register, demoLogin, logout }),
    [user, loading, error, login, register, demoLogin, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}