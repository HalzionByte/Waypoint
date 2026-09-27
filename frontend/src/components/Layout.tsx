import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import Logo from './Logo'
import { useAuth } from '../context/useAuth'
import { resetAll } from '../lib/store'

export default function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [resetting, setResetting] = useState(false)

  /**
   * Everything lives in this browser now, so a demo that has been clicked
   * through is one reload away from being a demo again. This is the fastest
   * way back to a clean state between runs.
   */
  async function onReset() {
    if (
      !window.confirm(
        'Delete everything stored in this browser and restore the sample routes?\n\nThis cannot be undone.',
      )
    ) {
      return
    }
    setResetting(true)
    try {
      await resetAll()
      navigate('/dashboard')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <Logo height={40} />
          <span className="brand__name">WayPoint</span>
        </Link>

        <nav className="nav">
          <NavLink to="/dashboard" className="nav__link">
            My routes
          </NavLink>
          <NavLink to="/landmarks" className="nav__link">
            Community
          </NavLink>
          <NavLink to="/verification" className="nav__link">
            Re-checks
          </NavLink>
          <Link to="/contribute" className="btn btn--sm nav__cta">
            Contribute
          </Link>
          {user && <span className="nav__user">{user.name}</span>}
        </nav>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <p>Maps get you to the area. WayPoint gets you to the door.</p>
        <p className="muted small">
          Everything here is stored in this browser only — no account, no server. Reloading
          keeps your work.{' '}
          <button className="linkish" disabled={resetting} onClick={() => void onReset()}>
            {resetting ? 'Restoring…' : 'Reset to the sample data'}
          </button>
        </p>
      </footer>
    </div>
  )
}
