const DAY_MS = 24 * 60 * 60 * 1000

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function relativeDue(value: string | null): string {
  if (!value) return 'Never checked'
  const diffDays = Math.round((new Date(value).getTime() - Date.now()) / DAY_MS)
  if (diffDays < 0) {
    const overdue = Math.abs(diffDays)
    return overdue === 1 ? '1 day overdue' : `${overdue} days overdue`
  }
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 60) return `Due in ${diffDays} days`
  return `Due ${formatDate(value)}`
}

export function verificationTone(value: string | null): 'ok' | 'warn' | 'bad' {
  if (!value) return 'bad'
  const days = (new Date(value).getTime() - Date.now()) / DAY_MS
  if (days < 0) return 'bad'
  if (days <= 30) return 'warn'
  return 'ok'
}

export function haversineMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

/** Rough walking time; deliberately simple for an MVP estimate. */
export function walkingMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 80))
}
