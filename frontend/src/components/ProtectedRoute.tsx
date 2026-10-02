import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/useAuth'
import { Alert, Spinner } from './ui'

/**
 * Gates everything that needs an account.
 *
 * While the stored token is being checked we wait, rather than redirecting —
 * bouncing a signed-in user to the login page on every refresh would be worse
 * than a brief spinner.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="centered">
        <Spinner label="Signing you in…" />
      </div>
    )
  }

  // The server is unreachable, so signing in would not help. Say that instead of
  // looping the user back to a login form that cannot possibly work.
  if (error) {
    return (
      <div className="centered">
        <div className="auth__card">
          <h1>Cannot reach WayPoint</h1>
          <Alert>{error}</Alert>
          <p className="auth__hint">
            Your work is safe on the server. This is a connection problem, not a lost
            account — reload once you are back online.
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    // Remember where they were going so signing in resumes it.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}