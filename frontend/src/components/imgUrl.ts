/**
 * Landmark photos are served from /uploads on the API origin. In a
 * single-container deploy that is the same origin as the app, so a relative
 * path works. In a split setup the image needs the API host, which a relative
 * URL cannot express — so resolve those paths against VITE_API_BASE.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  if (!path.startsWith('/')) return path
  return `${API_BASE}${path}`
}
