import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import Logo from './Logo'
import { useAuth } from '../context/useAuth'

export default function Layout() {
  const { user, logout, isDemo } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="app">
      <header className="topbar">
        <Link to={user ? '/dashboard' : '/'} className="brand">
          <Logo height={40} />
          <span className="brand__name">WayPoint</span>
        </Link>

        <nav className="nav">
          {user ? (
            <>
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
              <span className="nav__user">
                {user.name}
                {isDemo && <span className="nav__demo">Demo</span>}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  logout()
                  navigate('/')
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav__link">
                Log in
              </NavLink>
              <Link to="/register" className="btn btn--sm nav__cta">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="main">
        {isDemo && (
          <div className="demo-bar">
            <strong>You are exploring as a demo user.</strong> Everything you create here is
            shared and may be reset. Create your own account to keep your work.{' '}
            <Link to="/register">Create an account</Link>
          </div>
        )}
        <Outlet />
      </main>

      <footer className="footer">
        <p>Maps get you to the area. WayPoint gets you to the door.</p>
      </footer>
    </div>
  )
}
