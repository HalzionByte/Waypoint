import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { LOCAL_USER, ready } from '../lib/store'
import { AuthContext } from './authContext'
import type { User } from '../api/types'

/**
 * No sign-in, and no server to ask. The only asynchronous part is opening the
 * browser's database, so `loading` covers a few milliseconds rather than a
 * network round trip that might never succeed.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    ready()
      .then(() => {
        if (!cancelled) setUser(LOCAL_USER)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'This browser blocked local storage, so WayPoint cannot save anything.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, error }),
    [user, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
