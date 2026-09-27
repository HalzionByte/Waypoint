import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, getToken, setToken } from '../api/client'
import type { User } from '../api/types'
import { AuthContext } from './authContext'

/**
 * No sign-in step. Every visitor gets a session automatically, so the two
 * prebuilt demo routes are always on the dashboard and a judge never meets a
 * login form. The backend still has real auth (routes and community landmarks
 * need an owner) — it just never asks anyone to log in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const finish = (value: User | null) => {
      if (cancelled) return
      setUser(value)
      setLoading(false)
    }

    if (getToken()) {
      api
        .me()
        .then((me) => finish(me))
        .catch(() => {
          // Stale or rejected token: drop it and take a fresh session below.
          setToken(null)
          return api
            .demoLogin()
            .then((result) => {
              setToken(result.access_token)
              finish(result.user)
            })
            .catch(() => finish(null))
        })
      return () => {
        cancelled = true
      }
    }

    api
      .demoLogin()
      .then((result) => {
        setToken(result.access_token)
        finish(result.user)
      })
      .catch(() => finish(null))

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
