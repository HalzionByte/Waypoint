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
    } catch {
      setDemoError('The demo account is not available on this instance.')
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
