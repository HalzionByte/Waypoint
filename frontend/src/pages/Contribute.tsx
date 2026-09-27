import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { PublicLandmark } from '../api/types'
import PlacementPicker from '../components/map/PlacementPicker'
import type { LatLng } from '../components/map/PlacementPicker'
import PhotoField from '../components/PhotoField'
import { Alert } from '../components/ui'

/**
 * Contribute a landmark to the shared community library.
 *
 * Same two-step shape as the route builder — place it, then describe it —
 * because a community landmark is useless without a location and a photo.
 */
export default function Contribute() {
  const [point, setPoint] = useState<LatLng | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<PublicLandmark | null>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // No upload endpoint exists for a landmark that has not been created yet, so
  // the photo is attached immediately after the contribution is published.
  const hasPoint = point !== null
  const hasPhoto = photoFile !== null
  const canSubmit = hasPoint && hasPhoto && name.trim().length > 0

  async function onSubmit() {
    if (!point) {
      setError('Tap the map to place the landmark first.')
      return
    }
    if (!hasPhoto) {
      setError('A photo is what makes a community landmark recognisable to strangers.')
      return
    }
    if (!name.trim()) {
      setError('Give the landmark a name.')
      return
    }

    setError('')
    setBusy(true)
    let landmark: PublicLandmark | null = null
    try {
      landmark = await api.contribute({
        name: name.trim(),
        lat: point.lat,
        lng: point.lng,
        description: description.trim(),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish the landmark.')
      setBusy(false)
      return
    }

    let photoNote = ''
    if (landmark && photoFile) {
      try {
        landmark = await api.uploadPublicLandmarkPhoto(landmark.id, photoFile)
      } catch {
        photoNote = ' The photo did not upload — you can add it from the library.'
      }
    }

    setBusy(false)
    if (landmark) setCreated(landmark)

    if (photoNote) setError(photoNote)
    // Reset the draft either way; the confirmation panel takes over.
    setPoint(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    setName('')
    setDescription('')
  }

  if (created) {
    return (
      <div className="page page--narrow">
        <div className="contribute-done">
          <span className="contribute-done__tick" aria-hidden>
            ✓
          </span>
          <h1>Thanks — “{created.name}” is in the library</h1>
          <p>
            Anyone can now add it to their routes. It is checked again in six months; until then
            you can confirm it or replace the photo, and other users can help if it changes.
          </p>
          <div className="contribute-done__actions">
            <Link to="/landmarks" className="btn">
              Browse the library
            </Link>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setCreated(null)
                setError('')
              }}
            >
              Contribute another
            </button>
            <Link to="/dashboard" className="btn btn--ghost">
              Back to my routes
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Contribute a landmark</h1>
          <p className="page__sub">
            Share something recognisable with your neighbourhood. Once published, anyone can use it
            in their routes, and it is re-checked every six months.
          </p>
        </div>
      </div>

      <div className="builder">
        <section className="builder__list">
          <div className="step-head">
            <span className={`step-head__num${hasPoint ? ' step-head__num--done' : ''}`}>1</span>
            <div>
              <strong>Place it on the map</strong>
              <p className="muted">
                {point
                  ? 'Drag the pin to adjust it, or tap elsewhere to move it.'
                  : 'Tap the spot this landmark sits at.'}
              </p>
            </div>
          </div>

          <PlacementPicker value={point} onChange={setPoint} className="map map--pick map--tall" />

          <div className="add-card__placed">
            {point ? (
              <>
                <span className="muted">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
                <button className="linkish" onClick={() => setPoint(null)}>
                  Clear
                </button>
              </>
            ) : (
              <span className="muted">No pin dropped yet.</span>
            )}
          </div>

          <div className="step-head">
            <span className={`step-head__num${canSubmit ? ' step-head__num--done' : ''}`}>2</span>
            <div>
              <strong>Add a photo and a name</strong>
              <p className="muted">
                {hasPoint
                  ? 'This is what makes the landmark recognisable to a stranger.'
                  : 'Place the landmark above to unlock this.'}
              </p>
            </div>
          </div>

          <fieldset className="add-card__form" disabled={!hasPoint}>
            <PhotoField
              photoUrl={photoPreview}
              alt={name || 'Selected landmark photo'}
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

            <label className="field">
              <span>What is it?</span>
              <input
                value={name}
                placeholder="Green Pharmacy"
                onChange={(e) => setName(e.target.value)}
              />
              <small>How a local would name it out loud.</small>
            </label>

            <label className="field">
              <span>
                Description <small>(optional)</small>
              </span>
              <textarea
                rows={2}
                value={description}
                placeholder="Green shopfront, opposite the mosque."
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </fieldset>

          {error && <Alert>{error}</Alert>}

          <button className="btn btn--block" disabled={!canSubmit || busy} onClick={() => void onSubmit()}>
            {busy ? 'Publishing…' : !hasPoint ? 'Place it on the map first' : !hasPhoto ? 'Add a photo' : 'Publish to the library'}
          </button>
        </section>

        <section className="builder__map">
          <div className="panel panel--muted contribute-aside">
            <h2>Why contribute?</h2>
            <ul className="tick-list">
              <li>One photo and a pin can save a delivery rider a wrong turn.</li>
              <li>
                Every landmark carries a six-month check-up, so neighbours keep it honest together.
              </li>
              <li>
                You stay the owner of your contribution — others can refresh the photo or report it
                as outdated, but only you confirm it.
              </li>
            </ul>
            <Link to="/landmarks" className="linkish">
              See what the community has shared →
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
