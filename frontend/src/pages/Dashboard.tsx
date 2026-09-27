import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { RouteSummary, VerificationSummary } from '../api/types'
import { Alert, EmptyState, Spinner, StatusPill } from '../components/ui'
import { formatDate } from '../lib/format'

export default function Dashboard() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null)
  const [summary, setSummary] = useState<VerificationSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.listRoutes(), api.verificationSummary()])
      .then(([routeData, summaryData]) => {
        setRoutes(routeData)
        setSummary(summaryData)
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your routes.'),
      )
  }, [])

  async function onDelete(route: RouteSummary) {
    if (!window.confirm(`Delete "${route.title}" and all of its landmarks?`)) return
    try {
      await api.deleteRoute(route.id)
      setRoutes((current) => current?.filter((r) => r.id !== route.id) ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that route.')
    }
  }

  if (error) return <Alert>{error}</Alert>
  if (!routes) return <Spinner label="Loading your routes…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>My routes</h1>
          <p className="page__sub">Each route is a final-approach guide for one destination.</p>
        </div>
        <Link to="/routes/new" className="btn">
          + Create location
        </Link>
      </div>

      {summary && summary.overdue > 0 && (
        <div className="banner banner--warn">
          <strong>
            {summary.overdue} landmark{summary.overdue === 1 ? '' : 's'} need re-checking.
          </strong>{' '}
          Old directions are the fastest way to send someone to the wrong house.{' '}
          <Link to="/verification">Review them</Link>
        </div>
      )}

      {routes.length === 0 ? (
        <EmptyState title="No routes yet">
          <p>Create your first location and describe it with the landmarks around it.</p>
          <button className="btn" onClick={() => navigate('/routes/new')}>
            Create location
          </button>
        </EmptyState>
      ) : (
        <div className="route-grid">
          {routes.map((route) => (
            <article key={route.id} className="route-card">
              <header>
                <h2>{route.title}</h2>
                {route.destination_name && <p className="muted">{route.destination_name}</p>}
              </header>

              <dl className="route-card__meta">
                <div>
                  <dt>Landmarks</dt>
                  <dd>{route.landmark_counts.total}</dd>
                </div>
                <div>
                  <dt>Sharing</dt>
                  <dd>{route.is_published ? 'Link active' : 'Hidden'}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(route.updated_at)}</dd>
                </div>
              </dl>

              {route.landmark_counts.stale > 0 ? (
                <StatusPill tone="bad">
                  {route.landmark_counts.stale} need re-checking
                </StatusPill>
              ) : route.landmark_counts.total > 0 ? (
                <StatusPill tone="ok">All landmarks current</StatusPill>
              ) : (
                <StatusPill tone="warn">No landmarks yet</StatusPill>
              )}

              <footer className="route-card__actions">
                <Link to={`/routes/${route.id}`} className="btn btn--sm">
                  {route.landmark_counts.total > 0 ? 'Edit route' : 'Add landmarks'}
                </Link>
                <Link to={`/routes/${route.id}/share`} className="btn btn--ghost btn--sm">
                  Share
                </Link>
                <button className="btn btn--danger btn--sm" onClick={() => onDelete(route)}>
                  Delete
                </button>
              </footer>
          </article>
        ))}
        </div>
      )}
    </div>
  )
}
