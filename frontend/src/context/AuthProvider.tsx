import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, getToken, setToken } from '../api/client'
import { DEMO_EMAIL } from '../lib/demo'
import type { User } from '../api/types'
import { AuthContext } from './authContext'

/** Set once someone deliberately logs out, so we stop yanking them back in. */
const DISMISSED_KEY = 'waypoint.demoDismissed'

function demoDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The three states are distinct: we must not flash the login page while we
  // are still deciding whether this visitor gets the demo account. If there is
  // nothing to resolve — no stored token and auto-login suppressed — start
  // resolved, so no setState is needed in the effect for that case.
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()) || !demoDismissed())
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    if (getToken()) {
      api
        .me()
        .then((me) => {
          setUser(me)
          setDemo(me.email === DEMO_EMAIL)
        })
        .catch(() => setToken(null))
        .finally(() => setLoading(false))
      return
    }

    // Someone deliberately logged out earlier in this tab: respect that and
    // stay signed out rather than pulling them back into the demo. `loading`
    // already starts false for this case.
    if (demoDismissed()) return

    // Otherwise offer the demo account so nobody hits a login wall. If it is
    // unavailable we simply fall through to a signed-out visitor.
    let cancelled = false
    api
      .demoLogin()
      .then((result) => {
        if (cancelled) return
        setToken(result.access_token)
        setUser(result.user)
        setDemo(true)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password)
    setToken(result.access_token)
    setUser(result.user)
    setDemo(result.user.email === DEMO_EMAIL)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.register(name, email, password)
    setToken(result.access_token)
    setUser(result.user)
    setDemo(false)
  }, [])

  const enterDemo = useCallback(async () => {
    // Same endpoint the automatic sign-in uses, so there is no demo password
    // in the bundle and it stays in step with the backend's own switch.
    const result = await api.demoLogin()
    setToken(result.access_token)
    setUser(result.user)
    setDemo(true)
  }, [])

  const logout = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Private browsing: auto-login may resume, which is acceptable.
    }
    setToken(null)
    setUser(null)
    setDemo(false)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, enterDemo, logout, isDemo: demo }),
    [user, loading, login, register, enterDemo, logout, demo],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
