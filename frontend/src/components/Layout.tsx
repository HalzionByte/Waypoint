import { Link, NavLink, Outlet } from 'react-router-dom'

import Logo from './Logo'
import { useAuth } from '../context/useAuth'

export default function Layout() {
  const { user } = useAuth()

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
      </footer>
    </div>
  )
}
