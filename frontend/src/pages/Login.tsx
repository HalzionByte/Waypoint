import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../context/useAuth'
import { Alert } from '../components/ui'

export default function Login() {
  const { login, enterDemo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [demoError, setDemoError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onDemo() {
    setDemoError('')
    setDemoBusy(true)
    try {
      await enterDemo()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // Surface the real cause. A 403 means the platform is blocking the API
      // (Vercel Deployment Protection), a 404 means the demo was not seeded —
      // very different fixes, so do not collapse them into one message.
      const status = err instanceof ApiError ? err.status : 0
      if (status === 403) {
        setDemoError(
          'The API is blocking requests (403). Turn off Vercel Deployment Protection ' +
            'in project Settings, then redeploy.',
        )
      } else if (status === 404 || status === 503) {
        setDemoError(
          'The demo account could not be created. Check the function logs on Vercel.',
        )
      } else if (status === 0) {
        setDemoError('Could not reach the API. Check the deployment logs.')
      } else {
        setDemoError(`Could not open the demo (error ${status}).`)
      }
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={onSubmit}>
        <h1>Log in</h1>
        <p className="auth__hint">Route creators need an account. Recipients do not.</p>

        {error && <Alert>{error}</Alert>}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button className="btn btn--block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>

        <div className="auth__or" aria-hidden="true">
          <span />
          or
          <span />
        </div>

        <button
          className="btn btn--ghost btn--block"
          disabled={demoBusy}
          onClick={() => void onDemo()}
        >
          {demoBusy ? 'Opening the demo…' : 'Use the demo account'}
        </button>
        <p className="auth__hint auth__hint--tight">
          Sign in instantly as a demo user with two sample routes already set up. Nothing to
          type.
        </p>
        {demoError && <Alert>{demoError}</Alert>}

        <p className="auth__foot">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  )
}
