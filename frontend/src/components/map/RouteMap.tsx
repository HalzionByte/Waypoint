import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import type { Landmark } from '../../api/types'
import { destinationIcon, numberedIcon, TILE_ATTRIBUTION, TILE_URL } from './leafletSetup'
import './leafletSetup'

interface Props {
  destination: { lat: number; lng: number; name: string }
  landmarks: Landmark[]
  activeId?: number | null
  onSelect?: (landmarkId: number) => void
  className?: string
}

/** Fits the viewport around the destination and the plotted landmarks. */
function FitBounds({
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
    map.fitBounds(all, { padding: [48, 48], maxZoom: 18 })
  }, [destination.lat, destination.lng, points, map])
  return null
}

export default function RouteMap({
  destination,
  landmarks,
  activeId,
  onSelect,
  className,
}: Props) {
  const plotted = useMemo(
    () =>
      landmarks.filter(
        (lm): lm is Landmark & { lat: number; lng: number } =>
          lm.lat !== null && lm.lng !== null,
      ),
    [landmarks],
  )

  const line = useMemo<[number, number][]>(
    () => plotted.map((lm) => [lm.lat, lm.lng]),
    [plotted],
  )

  // Memoised so <FitBounds>'s effect doesn't re-run on every render.
  const points = useMemo<[number, number][]>(() => [...line], [line])

  return (
    <MapContainer
      center={[destination.lat, destination.lng]}
      zoom={17}
      className={className ?? 'map'}
      scrollWheelZoom
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: '#2563eb', weight: 4, dashArray: '8 8' }} />
      )}

      {plotted.map((lm) => (
        <Marker
          key={lm.id}
          position={[lm.lat, lm.lng]}
          icon={numberedIcon(lm.position + 1, lm.action === 'destination' ? 'destination' : 'default')}
          zIndexOffset={activeId === lm.id ? 1000 : 0}
          eventHandlers={onSelect ? { click: () => onSelect(lm.id) } : undefined}
        >
          <Popup>
            <strong>
              {lm.position + 1}. {lm.name}
            </strong>
            {lm.instruction && <div>{lm.instruction}</div>}
          </Popup>
        </Marker>
      ))}

      <Marker position={[destination.lat, destination.lng]} icon={destinationIcon()}>
        <Popup>
          <strong>Destination</strong>
          <div>{destination.name || 'Pinned destination'}</div>
        </Popup>
      </Marker>

      <FitBounds destination={destination} points={points} />
    </MapContainer>
  )
}
