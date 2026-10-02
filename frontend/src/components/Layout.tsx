import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import Logo from './Logo'
import { useAuth } from '../context/useAuth'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function onSignOut() {
    logout()
    // Everything behind ProtectedRoute needs an account, so landing on the
    // signed-out landing page is the only honest place to be.
    navigate('/')
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

          {user ? (
            <>
              <span className="nav__user">{user.name}</span>
              <button className="linkish" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn--sm nav__cta">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <p>Maps get you to the area. WayPoint gets you to the door.</p>
        <p className="muted small">
          Your routes and photos are saved to your account, so they follow you across
          devices. Anyone with a shared link can open that route without an account.
        </p>
      </footer>
    </div>
  )
}