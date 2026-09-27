import type { ReactNode } from 'react'

import { useAuth } from '../context/useAuth'
import { Spinner } from './ui'

/**
 * There is no sign-in, so nothing should normally be blocked. This only waits
 * out the brief session handshake and, if the API is unreachable, explains why
 * the app looks empty instead of silently rendering a broken screen.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="centered">
        <Spinner label="Opening WayPoint…" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="centered">
        <div className="auth__card">
          <h1>Cannot reach the API</h1>
          <p className="auth__hint">
            The demo data loads from the server. If this does not resolve on its own, the
            backend is unreachable — check the deployment and its function logs.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
