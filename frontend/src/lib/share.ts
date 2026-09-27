/**
 * Share links that survive the loss of a server.
 *
 * The share link used to be `origin/r/<token>` and the token was looked up in
 * the database. With no backend there is nothing to look it up, so a recipient
 * on a different device would get nothing.
 *
 * So the route travels *inside the link*: the steps are packed into the URL
 * fragment as base64url. A fragment is never sent to a server, so this adds no
 * request, and it works on any device that opens the link.
 *
 * The trade-offs, stated plainly:
 *  - Photos cannot travel. A Blob is far too large for a URL, so a shared link
 *    shows the steps, the map and the instructions, but not the pictures. The
 *    QR code therefore encodes the short link, which only resolves on the
 *    device that holds the data, because a QR code cannot carry a payload this
 *    size either.
 *  - Long routes make long links. WhatsApp and mail handle them fine; some
 *    older tools truncate.
 */

import type { Landmark } from '../api/types'
import { shareUrlFor } from './store'

/** Fragment key. Short, because every byte here is visible in the URL bar. */
const PAYLOAD_KEY = 'd'

/** Landmarks are trimmed to what a recipient actually needs. */
interface PackedLandmark {
  n: string
  a: Landmark['action']
  i: string
  d: string
  x: number | null
  y: number | null
}

export interface PackedRoute {
  t: string
  n: string
  a: string
  x: number
  y: number
  s: PackedLandmark[]
}

/** base64url, so the payload survives being pasted into any URL field. */
function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function pack(landmarks: Landmark[]): PackedLandmark[] {
  return landmarks.map((l) => ({
    n: l.name,
    a: l.action,
    i: l.instruction,
    d: l.description ?? '',
    x: l.lat,
    y: l.lng,
  }))
}

function unpack(raw: PackedLandmark[]): Landmark[] {
  const now = new Date().toISOString()
  return raw.map((l, position) => ({
    id: position + 1,
    route_id: 0,
    position,
    name: l.n,
    action: l.a,
    instruction: l.i,
    description: l.d,
    // Photos are per-device, so a shared link never has one to show.
    photo_url: null,
    lat: l.x,
    lng: l.y,
    created_at: now,
    last_verified: now,
    next_verification: now,
    is_stale: false,
    public_landmark_id: null,
  }))
}

/** The link to send someone: short URL plus the route in the fragment. */
export function buildShareLink(
  token: string,
  route: {
    title: string
    destination_name: string
    destination_address: string
    destination_lat: number
    destination_lng: number
    landmarks: Landmark[]
  },
): string {
  const payload: PackedRoute = {
    t: route.title,
    n: route.destination_name,
    a: route.destination_address,
    x: route.destination_lat,
    y: route.destination_lng,
    s: pack(route.landmarks),
  }
  return `${shareUrlFor(token)}#${PAYLOAD_KEY}=${encodeBase64Url(JSON.stringify(payload))}`
}

/** Read a payload out of a URL fragment, or null if there isn't one. */
export function readSharePayload(hash: string): {
  title: string
  destination_name: string
  destination_address: string
  destination_lat: number
  destination_lng: number
  landmarks: Landmark[]
} | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null

  const params = new URLSearchParams(raw)
  const encoded = params.get(PAYLOAD_KEY)
  if (!encoded) return null

  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as PackedRoute
    if (!parsed || typeof parsed.t !== 'string' || !Array.isArray(parsed.s)) return null
    return {
      title: parsed.t,
      destination_name: parsed.n ?? '',
      destination_address: parsed.a ?? '',
      destination_lat: Number(parsed.x) || 0,
      destination_lng: Number(parsed.y) || 0,
      landmarks: unpack(parsed.s),
    }
  } catch {
    // A truncated or hand-edited link must fail quietly, not throw on render.
    return null
  }
}
