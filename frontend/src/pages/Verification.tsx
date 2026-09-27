import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { DueLandmark, VerificationSummary } from '../api/types'
import { LandmarkPhoto } from '../components/imgUrl'
import { Alert, EmptyState, Spinner, StatusPill } from '../components/ui'
import { formatDate } from '../lib/format'

const TONE = {
  overdue: 'bad',
  due_soon: 'warn',
  verified: 'ok',
} as const

const HEADLINE = {
  overdue: 'Needs re-checking',
  due_soon: 'Due soon',
  verified: 'Current',
} as const

export default function Verification() {
  const [summary, setSummary] = useState<VerificationSummary | null>(null)
  const [due, setDue] = useState<DueLandmark[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([api.verificationSummary(), api.dueLandmarks()])
      .then(([summaryData, dueData]) => {
        setSummary(summaryData)
        setDue(dueData)
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your checklist.'),
      )
  }, [])

  async function onConfirm(landmark: DueLandmark) {
    setBusyId(landmark.id)
    setError('')
    try {
      await api.verifyLandmark(landmark.id)
      setDue((current) => current?.filter((lm) => lm.id !== landmark.id) ?? null)
      setSummary(await api.verificationSummary())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that confirmation.')
    } finally {
      setBusyId(null)
    }
  }

  if (error && !due) return <Alert>{error}</Alert>
  if (!due || !summary) return <Spinner label="Checking landmark freshness…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Landmark re-checks</h1>
          <p className="page__sub">
            Every landmark is re-confirmed every six months. Stale directions are the fastest way
            to send someone to the wrong house.
          </p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="stat-row">
        <div className="stat">
          <span className="stat__num">{summary.total_landmarks}</span>
          <span className="stat__label">Landmarks</span>
        </div>
        <div className="stat stat--ok">
          <span className="stat__num">{summary.verified}</span>
          <span className="stat__label">Current</span>
        </div>
        <div className="stat stat--warn">
          <span className="stat__num">{summary.due_soon}</span>
          <span className="stat__label">Due within 30 days</span>
        </div>
        <div className="stat stat--bad">
          <span className="stat__num">{summary.overdue}</span>
          <span className="stat__label">Overdue</span>
        </div>
      </div>

      {due.length === 0 ? (
        <EmptyState title="Everything is up to date">
          <p>No landmarks need re-checking right now. We will flag them after six months.</p>
        </EmptyState>
      ) : (
        <ul className="due-list">
          {due.map((landmark) => (
            <li key={landmark.id} className="due-item">
              <div className="due-item__photo">
                {landmark.photo_url ? (
                  <LandmarkPhoto
                    photoUrl={landmark.photo_url}
                    alt={landmark.name}
                    className="due-item__img"
                    placeholder=""
                  />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>

              <div className="due-item__body">
                <div className="due-item__head">
                  <strong>{landmark.name}</strong>
                  <StatusPill tone={TONE[landmark.status]}>{HEADLINE[landmark.status]}</StatusPill>
                </div>
                <p className="muted">{landmark.route_title}</p>
                <p className="muted small">
                  Last checked {formatDate(landmark.last_verified)}
                  {landmark.next_verification && ` · next due ${formatDate(landmark.next_verification)}`}
                </p>
              </div>

              <div className="due-item__actions">
                <Link to={`/routes/${landmark.route_id}`} className="btn btn--ghost btn--sm">
                  Open &amp; update
                </Link>
                <button
                  className="btn btn--sm"
                  disabled={busyId === landmark.id}
                  onClick={() => void onConfirm(landmark)}
                >
                  {busyId === landmark.id ? 'Saving…' : 'Still looks the same'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
