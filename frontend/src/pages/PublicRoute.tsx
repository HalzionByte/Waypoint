import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { PublicRoute as PublicRouteData } from '../api/types'
import QrImage from '../components/QrImage'
import { LandmarkPhoto } from '../components/imgUrl'
import RouteMap from '../components/map/RouteMap'
import { Alert, Spinner, StatusPill } from '../components/ui'
import { actionIcon, actionLabel } from '../lib/actions'
import { formatDate, haversineMetres, walkingMinutes } from '../lib/format'

export default function PublicRoute() {
  const { token } = useParams()
  const [route, setRoute] = useState<PublicRouteData | null>(null)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!token) return

    let cancelled = false
    api
      .publicRoute(token)
      .then((data) => {
        if (!cancelled) setRoute(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'This route link is invalid or has been turned off.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const totalMetres = useMemo(() => {
    if (!route) return 0
    const points = route.landmarks.filter((lm) => lm.lat !== null && lm.lng !== null)
    let sum = 0
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      sum += haversineMetres({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! })
    }
    return sum
  }, [route])

  if (!token) {
    return (
      <div className="page">
        <Alert>This link is missing its route code.</Alert>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page">
        <Alert>{error}</Alert>
      </div>
    )
  }
  if (!route) return <Spinner label="Loading route…" />

  const progress = checked.size
  const allDone = route.landmarks.length > 0 && checked.size === route.landmarks.length

  function toggle(id: number) {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page page--narrow">
      <header className="viewer__head">
        <p className="hero__eyebrow">Shared WayPoint route</p>
        <h1>{route.title}</h1>
        {route.destination_name && <p className="page__sub">Destination: {route.destination_name}</p>}
        {route.destination_address && <p className="muted">{route.destination_address}</p>}

        <div className="viewer__meta">
          <span className="chip">
            {route.landmarks.length} landmark{route.landmarks.length === 1 ? '' : 's'}
          </span>
          {totalMetres > 0 && <span className="chip">~{totalMetres} m</span>}
          {totalMetres > 0 && <span className="chip">~{walkingMinutes(totalMetres)} min walk</span>}
          <span className="chip chip--muted">Updated {formatDate(route.last_updated)}</span>
        </div>
      </header>

      <div className="banner">
        <strong>Step 1.</strong> Use your usual map app to reach this area, then follow the
        landmarks below.
      </div>

      {route.landmarks.length > 0 && (
        <div className="map-frame">
          <RouteMap
            destination={{
              lat: route.destination_lat,
              lng: route.destination_lng,
              name: route.destination_name,
            }}
            landmarks={route.landmarks}
            activeId={null}
          />
        </div>
      )}

      {progress > 0 && (
        <div className="progress">
          <div className="progress__bar">
            <span style={{ width: `${(progress / route.landmarks.length) * 100}%` }} />
          </div>
          <span className="progress__text">
            {progress} of {route.landmarks.length} matched
          </span>
        </div>
      )}

      <ol className="viewer-list">
        {route.landmarks.map((landmark) => {
          const done = checked.has(landmark.id)
          const isDestination = landmark.action === 'destination'
          return (
            <li
              key={landmark.id}
              className={`viewer-step${done ? ' viewer-step--done' : ''}${
                isDestination ? ' viewer-step--destination' : ''
              }`}
            >
              <span className="viewer-step__num" aria-hidden>
                {isDestination ? '★' : landmark.position + 1}
              </span>

              <div className="viewer-step__body">
                <div className="viewer-step__head">
                  <span className="viewer-step__action">
                    {actionIcon(landmark.action)} {actionLabel(landmark.action)}
                  </span>
                  <strong>{landmark.name}</strong>
                  {landmark.is_stale && <StatusPill tone="warn">May have changed</StatusPill>}
                </div>

                {landmark.photo_url ? (
                  <LandmarkPhoto
                    className="viewer-step__photo"
                    photoUrl={landmark.photo_url}
                    alt={landmark.name}
                  />
                ) : (
                  <div className="photo-placeholder photo-placeholder--flat">
                    No photo for this landmark
                  </div>
                )}

                {landmark.instruction && <p className="viewer-step__text">{landmark.instruction}</p>}
                {landmark.description && <p className="muted small">{landmark.description}</p>}
              </div>

              <button
                className={`btn btn--sm${done ? ' btn--ghost' : ''}`}
                onClick={() => toggle(landmark.id)}
              >
                {done ? 'Undo' : 'I found it'}
              </button>
            </li>
          )
        })}
      </ol>

      {allDone && (
        <div className="banner banner--ok">
          <strong>You have arrived.</strong> The destination is the landmark marked with a star.
        </div>
      )}

      <footer className="viewer__foot">
        <p className="muted small">
          Built with WayPoint — visual directions from local landmarks. If something does not
          match, ask the person who shared this route for an updated photo.
        </p>
        <details className="viewer__qr">
          <summary>Show QR code for this route</summary>
          {token && <QrImage text={route.share_url} alt="Route QR code" size={260} />}
        </details>
      </footer>
    </div>
  )
}
