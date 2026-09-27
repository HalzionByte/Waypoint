import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Vite rewrites the <img> paths inside Leaflet's CSS, but the default icon
// URLs are hardcoded in JS — point them at the bundled assets explicitly.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

/** A numbered pin, so the visiting order is obvious at a glance. */
export function numberedIcon(index: number, tone: 'default' | 'destination' = 'default') {
  return L.divIcon({
    className: 'wp-pin-wrapper',
    html: `<span class="wp-pin wp-pin--${tone}">${tone === 'destination' ? '★' : index}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

export const destinationIcon = () =>
  L.divIcon({
    className: 'wp-pin-wrapper',
    html: '<span class="wp-pin wp-pin--destination">★</span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })

/** The landmark currently being placed — deliberately unlike the saved pins. */
export const draftIcon = () =>
  L.divIcon({
    className: 'wp-pin-wrapper',
    html: '<span class="wp-pin wp-pin--draft">+</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
