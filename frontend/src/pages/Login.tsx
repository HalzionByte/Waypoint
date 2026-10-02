import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { Alert, Spinner } from '../components/ui'
import { useAuth } from '../context/useAuth'

type Mode = 'signin' | 'signup'

/**
 * Sign in, or create an account.
 *
 * Recipients of a shared route never see this page — `/r/:token` is public and
 * asks for nothing. Only people building routes need an account.
 */
export default function Login() {
  const { user, loading, error: authError, login, register, demoLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Send people back where they were headed before the session check bounced
  // them here, rather than always dropping them on the dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  if (loading) {
    return (
      <div className="centered">
        <Spinner label="Checking your session…" />
      </div>
    )
  }
  if (user) return <Navigate to={from} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        await register({ name: name.trim(), email: email.trim(), password })
      } else {
        await login({ email: email.trim(), password })
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onDemo() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await demoLogin()
      navigate(from, { replace: true })
    } catch (err) {
      // 404 means the server has demo sign-in switched off, which is expected
      // on a real deployment and worth saying plainly rather than showing raw.
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Demo sign-in is switched off on this server. Create an account instead.'
          : err instanceof ApiError
            ? err.message
            : 'Could not start the demo. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const signingUp = mode === 'signup'

  return (
    <div className="auth">
      <div className="auth__card">
        <h1>{signingUp ? 'Create your account' : 'Sign in to WayPoint'}</h1>
        <p className="auth__hint">
          {signingUp
            ? 'An account keeps your routes, photos and shared landmarks together across devices.'
            : 'Welcome back. Your routes are waiting.'}
        </p>

        {(error || authError) && <Alert>{error || authError}</Alert>}

        <form onSubmit={submit}>
          {signingUp && (
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                maxLength={120}
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              required
              minLength={signingUp ? 8 : undefined}
            />
            {signingUp && <small>At least 8 characters.</small>}
          </label>

          <button className="btn btn--block" type="submit" disabled={busy}>
            {busy ? 'Working…' : signingUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {!busy && (
          <>
            <p className="auth__foot">
              {signingUp ? 'Already have an account?' : 'No account yet?'}{' '}
              <button
                className="linkish"
                onClick={() => {
                  setMode(signingUp ? 'signin' : 'signup')
                  setError('')
                }}
              >
                {signingUp ? 'Sign in instead' : 'Create one'}
              </button>
            </p>

            <p className="auth__foot">
              <button className="linkish" onClick={() => void onDemo()}>
                Or open the demo account
              </button>
            </p>
          </>
        )}

        <p className="auth__foot">
          <Link to="/">Back to the home page</Link>
        </p>
      </div>
    </div>
  )
}