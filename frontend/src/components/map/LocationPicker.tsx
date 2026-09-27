import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import './leafletSetup'
import { TILE_ATTRIBUTION, TILE_URL } from './leafletSetup'

export interface LatLng {
  lat: number
  lng: number
}

interface Props {
  value: LatLng | null
  onChange?: (value: LatLng) => void
  zoom?: number
  className?: string
}

/** Keeps the viewport in sync when a coordinate is set from outside the map. */
function Recentre({ value, zoom }: { value: LatLng | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], zoom ?? map.getZoom())
  }, [value, zoom, map])
  return null
}

function ClickHandler({ onChange }: { onChange?: (value: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onChange?.({ lat: Number(event.latlng.lat.toFixed(6)), lng: Number(event.latlng.lng.toFixed(6)) })
    },
  })
  return null
}

export default function LocationPicker({ value, onChange, zoom = 17, className }: Props) {
  const center: [number, number] = value ? [value.lat, value.lng] : [31.5204, 74.3587]

  return (
    <MapContainer
      center={center}
      zoom={value ? zoom : 12}
      className={className ?? 'map'}
      scrollWheelZoom
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          draggable={Boolean(onChange)}
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng()
              onChange?.({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
            },
          }}
        >
          <Popup>Selected point</Popup>
        </Marker>
      )}
      <Recentre value={value} zoom={zoom} />
      {onChange && <ClickHandler onChange={onChange} />}
    </MapContainer>
  )
}
