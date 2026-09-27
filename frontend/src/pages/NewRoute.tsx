import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import LocationPicker from '../components/map/LocationPicker'
import type { LatLng } from '../components/map/LocationPicker'
import { Alert } from '../components/ui'

export default function NewRoute() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [destinationName, setDestinationName] = useState('')
  const [address, setAddress] = useState('')
  const [point, setPoint] = useState<LatLng | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!point) {
      setError('Tap the map to drop a pin on the exact destination.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const route = await api.createRoute({
        title: title.trim(),
        destination_name: destinationName.trim(),
        destination_address: address.trim(),
        destination_lat: point.lat,
        destination_lng: point.lng,
      })
      navigate(`/routes/${route.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the route.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Create a location</h1>
          <p className="page__sub">
            Pin the exact destination first. You will add the landmark sequence next.
          </p>
        </div>
      </div>

      <form className="split" onSubmit={onSubmit}>
        <div className="split__side">
          {error && <Alert>{error}</Alert>}

          <label className="field">
            <span>Route title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="House opposite the black gate"
            />
            <small>Only you see this. Recipients see the landmark sequence.</small>
          </label>

          <label className="field">
            <span>Destination name</span>
            <input
              value={destinationName}
              onChange={(e) => setDestinationName(e.target.value)}
              placeholder="Ali Residence"
            />
          </label>

          <label className="field">
            <span>Area or street</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Lane 4, near Samsung Repair Store"
            />
          </label>

          <div className="pin-status">
            {point ? (
              <>
                <strong>Pinned</strong>
                <span className="muted">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              </>
            ) : (
              <span className="muted">No pin dropped yet — tap the map.</span>
            )}
          </div>

          <button className="btn btn--block" disabled={busy || !point}>
            {busy ? 'Creating…' : 'Create and add landmarks'}
          </button>
        </div>

        <div className="split__map">
          <LocationPicker value={point} onChange={setPoint} />
        </div>
      </form>
    </div>
  )
}
