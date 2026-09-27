import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ApiError, api, publicQrUrl } from '../api/client'
import type { RouteDetail } from '../api/types'
import { photoUrl } from '../components/imgUrl'
import { Alert, Spinner } from '../components/ui'
import { formatDate } from '../lib/format'

export default function RouteShare() {
  const { routeId } = useParams()
  const id = Number(routeId)

  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)

  useEffect(() => {
    api
      .getRoute(id)
      .then(setRoute)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load this route.'),
      )
  }, [id])

  async function onCopy() {
    if (!route) return
    try {
      await navigator.clipboard.writeText(route.share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — select the link text and copy it manually.')
    }
  }

  async function onRotate() {
    if (!route) return
    if (!window.confirm('Create a new link? The current link and QR code will stop working.')) {
      return
    }
    setRotating(true)
    setError('')
    try {
      const updated = await api.rotateShareToken(route.id)
      setRoute({ ...route, share_token: updated.share_token, share_url: updated.share_url })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a new link.')
    } finally {
      setRotating(false)
    }
  }

  function onNativeShare() {
    if (!route) return
    if (navigator.share) {
      void navigator
        .share({ title: route.title, text: `How to reach ${route.title}`, url: route.share_url })
        .catch(() => undefined)
    } else {
      void onCopy()
    }
  }

  if (error && !route) return <Alert>{error}</Alert>
  if (!route) return <Spinner label="Loading share details…" />

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `How to reach ${route.title}: ${route.share_url}`,
  )}`
  const sms = `sms:?&body=${encodeURIComponent(`How to reach ${route.title}: ${route.share_url}`)}`

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <nav className="crumbs">
            <Link to="/dashboard">My routes</Link> <span>/</span>{' '}
            <Link to={`/routes/${route.id}`}>{route.title}</Link>
          </nav>
          <h1>Share this route</h1>
          <p className="page__sub">
            Recipients need no account. {route.landmark_counts.total} landmark
            {route.landmark_counts.total === 1 ? '' : 's'} in the sequence.
          </p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="share">
        <section className="share__link">
          <h2>Share link</h2>
          <div className="copy-row">
            <input readOnly value={route.share_url} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => void onCopy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="share__buttons">
            <a className="btn" href={whatsapp} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a className="btn btn--ghost" href={sms}>
              SMS
            </a>
            <button className="btn btn--ghost" onClick={onNativeShare}>
              Share…
            </button>
          </div>

          <h2>Or let them scan</h2>
          <div className="share__qr">
            {/* Token-scoped URL: an <img> request cannot send an auth header. */}
            <img src={publicQrUrl(route.share_token)} alt={`QR code for ${route.title}`} />
            <p className="muted">
              Print this on a sign, a clinic notice, or a business card. Anyone who scans it
              opens this exact route.
            </p>
            <a
              className="btn btn--ghost btn--sm"
              href={`${publicQrUrl(route.share_token)}?download=true`}
            >
              Download QR
            </a>
          </div>

          <footer className="share__foot">
            <p className="muted">Created {formatDate(route.created_at)}</p>
            <button className="linkish" disabled={rotating} onClick={() => void onRotate()}>
              {rotating ? 'Creating…' : 'Create a new link (invalidates the old one)'}
            </button>
          </footer>
        </section>

        <aside className="share__preview">
          <h2>What they will see</h2>
          <ol className="preview-list">
            {route.landmarks.length === 0 && (
              <li className="muted">
                This route has no landmarks yet — add some before sharing.
              </li>
            )}
            {route.landmarks.map((landmark) => (
              <li key={landmark.id}>
                {landmark.photo_url ? (
                  <img src={photoUrl(landmark.photo_url)!} alt="" />
                ) : (
                  <div className="photo-placeholder photo-placeholder--sm" />
                )}
                <div>
                  <strong>{landmark.name}</strong>
                  <p>{landmark.instruction}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link to={`/r/${route.share_token}`} className="btn btn--ghost btn--sm">
            Open the recipient view
          </Link>
        </aside>
      </div>
    </div>
  )
}
