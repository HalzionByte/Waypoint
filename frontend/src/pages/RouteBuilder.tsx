import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { Landmark, LandmarkAction, LandmarkInput, RouteDetail } from '../api/types'
import { LandmarkPhoto } from '../components/imgUrl'
import PlacementPicker from '../components/map/PlacementPicker'
import type { LatLng } from '../components/map/PlacementPicker'
import PhotoField from '../components/PhotoField'
import RouteMap from '../components/map/RouteMap'
import { Alert, Spinner, StatusPill } from '../components/ui'
import { ACTIONS, instructionTemplate } from '../lib/actions'
import { formatDate, haversineMetres, relativeDue, verificationTone } from '../lib/format'

const newDraft = () => ({
  name: '',
  action: 'pass' as LandmarkAction,
  instruction: '',
  description: '',
  point: null as LatLng | null,
  /** PRD §9 lists the map position as optional, so it can be waived. */
  waived: false,
})

export default function RouteBuilder() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const id = Number(routeId)
  const idIsValid = !Number.isNaN(id) && id > 0

  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState(newDraft)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [busyOrder, setBusyOrder] = useState(false)

  // Photo for the landmark being composed. There is no upload endpoint for a
  // landmark that does not exist yet, so it is previewed locally and uploaded
  // straight after the landmark is created.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // Re-reads the route after a create/update/delete.
  const load = useCallback(async () => {
    try {
      setRoute(await api.getRoute(id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this route.')
    }
  }, [id])

  useEffect(() => {
    if (!idIsValid) return

    let cancelled = false
    api
      .getRoute(id)
      .then((data) => {
        if (!cancelled) setRoute(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load this route.')
      })

    return () => {
      cancelled = true
    }
  }, [id, idIsValid])

  const totalMetres = useMemo(() => {
    if (!route) return 0
    const points = route.landmarks.filter((lm) => lm.lat !== null && lm.lng !== null)
    if (points.length < 2) return 0
    let sum = 0
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      sum += haversineMetres({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! })
    }
    return sum
  }, [route])

  // Placing the landmark on the map is step 1; the description form unlocks
  // once that is done (or explicitly waived).
  const placed = draft.point !== null || draft.waived
  const canAdd = placed && draft.name.trim().length > 0

  async function guard<T>(work: () => Promise<T>): Promise<T | null> {
    setError('')
    setNotice('')
    try {
      return await work()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      return null
    }
  }

  async function onAddLandmark() {
    if (!route) return
    if (!placed) {
      setError('Tap the map to place this landmark first.')
      return
    }
    if (!draft.name.trim()) {
      setError('Give the landmark a name.')
      return
    }
    const created = await guard(() =>
      api.addLandmark(route.id, {
        name: draft.name.trim(),
        action: draft.action,
        instruction: draft.instruction.trim() || instructionTemplate(draft.action, draft.name),
        description: draft.description.trim(),
        lat: draft.point?.lat ?? null,
        lng: draft.point?.lng ?? null,
      }),
    )
    if (!created) return

    let photoNote = ''
    if (photoFile) {
      setUploadingPhoto(true)
      try {
        await api.uploadPhoto(created.id, photoFile)
        photoNote = ' Its photo is attached.'
      } catch {
        // The landmark itself is saved, so this must not read as a total failure.
        photoNote = ' The photo did not upload — open the landmark to add it again.'
      } finally {
        setUploadingPhoto(false)
      }
    }

    setNotice(
      `Added “${created.name}” with ${created.position + 1} of ${
        route.landmarks.length + 1
      } steps.${photoNote} Use the arrows to reorder.`,
    )
    setPhotoFile(null)
    setPhotoPreview(null)
    setDraft(newDraft())
    await load()
  }

  async function onPatch(landmark: Landmark, changes: Partial<LandmarkInput>) {
    if (!route) return
    const updated = await guard(() => api.updateLandmark(landmark.id, changes))
    if (updated) await load()
  }

  async function onDeleteLandmark(landmark: Landmark) {
    if (!window.confirm(`Remove "${landmark.name}" from this route?`)) return
    const done = await guard(() => api.deleteLandmark(landmark.id))
    if (done !== null) await load()
  }

  async function onMove(landmark: Landmark, direction: -1 | 1) {
    if (!route || busyOrder) return
    const ids = route.landmarks.map((lm) => lm.id)
    const index = ids.indexOf(landmark.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]

    // Two overlapping reorders would send competing orderings for the same
    // unique (route_id, position) slots.
    setBusyOrder(true)
    const result = await guard(() => api.reorderLandmarks(route.id, ids))
    if (result) setRoute({ ...route, landmarks: result })
    setBusyOrder(false)
  }

  async function onVerify(landmark: Landmark) {
    const target = landmark.public_landmark_id
    const updated = await guard<unknown>(() =>
      target ? api.verifyPublicLandmark(target) : api.verifyLandmark(landmark.id),
    )
    if (updated) await load()
  }

  async function onPhoto(landmark: Landmark, file: File) {
    // A reused community landmark is shared, so refreshing it must update the
    // library entry — not just this route's private copy of the photo.
    const target = landmark.public_landmark_id
    setUploadingPhotoFor(landmark.id)
    const result = await guard<unknown>(() =>
      target
        ? api.uploadPublicLandmarkPhoto(target, file)
        : api.uploadPhoto(landmark.id, file),
    )
    setUploadingPhotoFor(null)
    if (result) await load()
  }

  if (!idIsValid) return <Alert>That route id is not valid.</Alert>
  if (error && !route) return <Alert>{error}</Alert>
  if (!route) return <Spinner label="Loading route…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <nav className="crumbs">
            <Link to="/dashboard">My routes</Link> <span>/</span> {route.title}
          </nav>
          <h1>{route.title}</h1>
          <p className="page__sub">
            {route.landmarks.length} landmark{route.landmarks.length === 1 ? '' : 's'}
            {totalMetres > 0 && ` · about ${totalMetres} m of final approach`}
          </p>
        </div>
        <div className="page__actions">
          <Link to={`/r/${route.share_token}`} className="btn btn--ghost btn--sm">
            Preview as recipient
          </Link>
          <Link to={`/routes/${route.id}/share`} className="btn btn--sm">
            Share &amp; QR
          </Link>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="builder">
        <section className="builder__list">
          <h2>Landmarks</h2>
          <p className="muted builder__hint">
            Add them in any order you like. Once they are all in, use the arrows to arrange them
            the way a visitor meets them.
          </p>

          {route.landmarks.length === 0 && (
            <div className="empty empty--inline">
              <p>No landmarks yet. Add the first one below.</p>
            </div>
          )}

          <ol className="lm-list">
            {route.landmarks.map((landmark, index) => (
              <li
                key={landmark.id}
                className={`lm-card${expanded === landmark.id ? ' lm-card--open' : ''}`}
              >
                <div className="lm-card__head">
                  <span className="lm-card__num" aria-hidden>
                    {landmark.action === 'destination' ? '★' : index + 1}
                  </span>

                  {/* A photo is what makes a landmark recognisable, so its
                      presence should be obvious without opening the card. */}
                  {landmark.photo_url && (
                    <LandmarkPhoto
                      photoUrl={landmark.photo_url}
                      alt=""
                      className="lm-card__thumb"
                      placeholder=""
                    />
                  )}

                  <button
                    className="lm-card__title"
                    onClick={() => setExpanded(expanded === landmark.id ? null : landmark.id)}
                  >
                    <strong>{landmark.name}</strong>
                    <span className="muted">{landmark.instruction || 'No instruction yet'}</span>
                    {landmark.public_landmark_id && (
                      <span className="lm-card__origin">
                        From the community library — its photo and six-month check-up are shared
                      </span>
                    )}
                  </button>

                  <div className="lm-card__status">
                    <StatusPill tone={verificationTone(landmark.next_verification)}>
                      {landmark.is_stale ? 'Needs re-check' : 'Current'}
                    </StatusPill>

                    {/* Ordering is a first-class action, so it stays visible
                        whether or not the card is expanded. */}
                    <div className="lm-reorder">
                      <button
                        className="icon-btn"
                        aria-label={`Move "${landmark.name}" earlier`}
                        disabled={index === 0 || busyOrder}
                        onClick={() => void onMove(landmark, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Move "${landmark.name}" later`}
                        disabled={index === route.landmarks.length - 1 || busyOrder}
                        onClick={() => void onMove(landmark, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>

                {expanded === landmark.id && (
                  <div className="lm-card__body">
                    <div className="lm-card__photo">
                      <PhotoField
                        photoUrl={landmark.photo_url}
                        alt={landmark.name}
                        busy={uploadingPhotoFor === landmark.id}
                        onSelect={(file) => void onPhoto(landmark, file)}
                      />
                    </div>

                    <div className="lm-card__fields">
                      <label className="field">
                        <span>Name</span>
                        <input
                          defaultValue={landmark.name}
                          onBlur={(e) => {
                            const value = e.target.value.trim()
                            if (value && value !== landmark.name) {
                              void onPatch(landmark, { name: value })
                            }
                          }}
                        />
                      </label>

                      <label className="field">
                        <span>Action</span>
                        <select
                          value={landmark.action}
                          onChange={(e) => {
                            const action = e.target.value as LandmarkAction
                            void onPatch(landmark, {
                              action,
                              instruction: instructionTemplate(action, landmark.name),
                            })
                          }}
                        >
                          {ACTIONS.map((action) => (
                            <option key={action.value} value={action.value}>
                              {action.icon} {action.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Instruction</span>
                        <input
                          defaultValue={landmark.instruction}
                          placeholder="Continue straight until you see the brown gate."
                          onBlur={(e) => {
                            const value = e.target.value.trim()
                            if (value !== landmark.instruction) {
                              void onPatch(landmark, { instruction: value })
                            }
                          }}
                        />
                      </label>

                      <label className="field">
                        <span>Description</span>
                        <textarea
                          rows={2}
                          defaultValue={landmark.description}
                          placeholder="Tall brown metal gate, on the left."
                          onBlur={(e) => {
                            const value = e.target.value.trim()
                            if (value !== landmark.description) {
                              void onPatch(landmark, { description: value })
                            }
                          }}
                        />
                      </label>
                    </div>

                    <footer className="lm-card__foot">
                      <span className="muted">
                        Last checked {formatDate(landmark.last_verified)} ·{' '}
                        {relativeDue(landmark.next_verification)}
                      </span>
                      <div className="lm-card__buttons">
                        <button
                          className="btn btn--sm"
                          onClick={() => void onVerify(landmark)}
                          title="Confirms this landmark still looks the same"
                        >
                          Looks the same
                        </button>
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => void onDeleteLandmark(landmark)}
                        >
                          Remove
                        </button>
                      </div>
                    </footer>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="add-card">
            <h3>Add a landmark</h3>

            {/* Step 1 — placement. Deliberately first: knowing where the
                landmark sits makes the description far easier to write. */}
            <div className="step-head">
              <span className={`step-head__num${placed ? ' step-head__num--done' : ''}`}>1</span>
              <div>
                <strong>Place it on the map</strong>
                <p className="muted">
                  {draft.point
                    ? 'Drag the pin to adjust it, or tap elsewhere to move it.'
                    : draft.waived
                      ? 'No map position for this one. Tap the map to place it anyway.'
                      : 'Tap the spot this landmark sits at.'}
                </p>
              </div>
            </div>

            <PlacementPicker
              value={draft.point}
              onChange={(point) => setDraft((d) => ({ ...d, point, waived: false }))}
              focus={{ lat: route.destination_lat, lng: route.destination_lng }}
              landmarks={route.landmarks}
            />

            <div className="add-card__placed">
              {draft.point ? (
                <>
                  <span className="muted">
                    {draft.point.lat.toFixed(5)}, {draft.point.lng.toFixed(5)}
                  </span>
                  <button
                    className="linkish"
                    onClick={() => setDraft((d) => ({ ...d, point: null, waived: false }))}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <button
                  className="linkish"
                  onClick={() => setDraft((d) => ({ ...d, waived: !d.waived }))}
                >
                  {draft.waived
                    ? 'Put it back on the map'
                    : 'Skip — this landmark has no distinct spot'}
                </button>
              )}
            </div>

            {/* Step 2 — description, gated behind step 1. */}
            <div className="step-head">
              <span className={`step-head__num${placed ? ' step-head__num--done' : ''}`}>2</span>
              <div>
                <strong>Describe it</strong>
                <p className="muted">
                  {placed
                    ? 'A name and a photo are what make a landmark recognisable.'
                    : 'Place the landmark above to unlock this.'}
                </p>
              </div>
            </div>

            <fieldset className="add-card__form" disabled={!placed}>
              <PhotoField
                photoUrl={photoPreview}
                busy={uploadingPhoto}
                alt={draft.name || 'Selected landmark photo'}
                onSelect={(file) => {
                  if (photoPreview) URL.revokeObjectURL(photoPreview)
                  setPhotoFile(file)
                  setPhotoPreview(URL.createObjectURL(file))
                }}
                onClear={() => {
                  if (photoPreview) URL.revokeObjectURL(photoPreview)
                  setPhotoFile(null)
                  setPhotoPreview(null)
                }}
              />

              <div className="add-card__row">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    placeholder="Brown Gate"
                    onChange={(e) => {
                      const name = e.target.value
                      setDraft((d) => ({
                        ...d,
                        name,
                        instruction: d.instruction || instructionTemplate(d.action, name),
                      }))
                    }}
                  />
                </label>

                <label className="field">
                  <span>Action</span>
                  <select
                    value={draft.action}
                    onChange={(e) => {
                      const action = e.target.value as LandmarkAction
                      setDraft((d) => ({
                        ...d,
                        action,
                        instruction: instructionTemplate(action, d.name),
                      }))
                    }}
                  >
                    {ACTIONS.map((action) => (
                      <option key={action.value} value={action.value}>
                        {action.icon} {action.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Instruction</span>
                <input
                  value={draft.instruction}
                  placeholder="Continue straight until you see the brown gate."
                  onChange={(e) => setDraft((d) => ({ ...d, instruction: e.target.value }))}
                />
              </label>

              <label className="field">
                <span>
                  Description <small>(optional)</small>
                </span>
                <textarea
                  rows={2}
                  value={draft.description}
                  placeholder="Tall brown metal gate, on the left."
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
            </fieldset>

            <button className="btn btn--block" disabled={!canAdd} onClick={() => void onAddLandmark()}>
              {canAdd ? 'Add landmark' : placed ? 'Give it a name' : 'Place it on the map first'}
            </button>
          </div>
        </section>

        <section className="builder__map">
          <RouteMap
            destination={{
              lat: route.destination_lat,
              lng: route.destination_lng,
              name: route.destination_name,
            }}
            landmarks={route.landmarks}
            activeId={expanded}
            onSelect={(landmarkId) =>
              setExpanded(expanded === landmarkId ? null : landmarkId)
            }
          />

          <div className="builder__danger">
            <button className="btn btn--danger btn--sm" onClick={() => navigate('/dashboard')}>
              Back to my routes
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
