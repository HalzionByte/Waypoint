import type { ReactNode } from 'react'

import { useAuth } from '../context/useAuth'
import { Spinner } from './ui'

/**
 * There is no sign-in, so nothing is really gated. This only waits out the
 * moment it takes to open the browser's database — and, if the browser refused
 * storage (private mode, blocked site data), says so instead of rendering a
 * dashboard that silently loses everything a judge does.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth()

  if (loading) {
    return (
      <div className="centered">
        <Spinner label="Opening WayPoint…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="centered">
        <div className="auth__card">
          <h1>Storage is blocked</h1>
          <p className="auth__hint">{error}</p>
          <p className="auth__hint">
            WayPoint keeps everything in this browser, so it needs site data to be
            allowed. Turn off private browsing, or allow cookies and storage for this
            site, then reload.
          </p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
