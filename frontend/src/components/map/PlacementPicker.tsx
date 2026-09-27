import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import type { Landmark } from '../../api/types'
import { destinationIcon, draftIcon, numberedIcon, TILE_ATTRIBUTION, TILE_URL } from './leafletSetup'
import './leafletSetup'

export interface LatLng {
  lat: number
  lng: number
}

/** Fallback view when there is no route destination to frame (contributing). */
const DEFAULT_CENTER: LatLng = { lat: 31.5204, lng: 74.3587 }

interface Props {
  value: LatLng | null
  onChange: (value: LatLng) => void
  /** Point to frame and mark with a star — the route destination, if there is one. */
  focus?: LatLng | null
  /** Already-saved landmarks, drawn as context so the new pin lands sensibly. */
  landmarks?: Landmark[]
  className?: string
}

function toLatLng(value: LatLng): [number, number] {
  return [value.lat, value.lng]
}

/** Frames the destination and the landmarks already on the route. */
function FitContext({
  destination,
  points,
}: {
  destination: { lat: number; lng: number }
  points: [number, number][]
}) {
  const map = useMap()
  useEffect(() => {
    const all: [number, number][] = [[destination.lat, destination.lng], ...points]
    if (all.length === 1) {
      map.setView(all[0], 17)
      return
    }
    map.fitBounds(all, { padding: [40, 40], maxZoom: 19 })
  }, [destination.lat, destination.lng, points, map])
  return null
}

/** Follows the draft pin only while the user has not placed one yet. */
function FollowDraft({ value }: { value: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (value) map.panTo(toLatLng(value), { animate: true })
  }, [value, map])
  return null
}

export default function PlacementPicker({
  value,
  onChange,
  focus = null,
  landmarks = [],
  className,
}: Props) {
  const contextPoints = useMemo(
    () => landmarks.filter((lm) => lm.lat !== null && lm.lng !== null),
    [landmarks],
  )

  const centre = value
    ? toLatLng(value)
    : focus
      ? toLatLng(focus)
      : ([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng] as [number, number])

  return (
    <MapContainer
      center={centre}
      zoom={focus || value ? 18 : 12}
      className={className ?? 'map map--pick'}
      scrollWheelZoom
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {/* Context only — the saved landmarks are editable from the list, not here. */}
      {contextPoints.map((lm) => (
        <Marker
          key={lm.id}
          position={[lm.lat as number, lm.lng as number]}
          icon={numberedIcon(lm.position + 1, lm.action === 'destination' ? 'destination' : 'default')}
          interactive={false}
        />
      ))}

      {focus && (
        <Marker position={toLatLng(focus)} icon={destinationIcon()} interactive={false} />
      )}

      {value && (
        <Marker
          position={toLatLng(value)}
          icon={draftIcon()}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng()
              onChange({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
            },
          }}
        />
      )}

      {!value && focus && (
        <FitContext
          destination={focus}
          points={contextPoints.map((lm) => [lm.lat as number, lm.lng as number])}
        />
      )}
      <FollowDraft value={value} />

      <ClickToPlace onChange={onChange} />
    </MapContainer>
  )
}

function ClickToPlace({ onChange }: { onChange: (value: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onChange({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      })
    },
  })
  return null
}
