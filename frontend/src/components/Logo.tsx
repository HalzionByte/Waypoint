import LogoMark from './LogoMark'

/**
 * The WayPoint logo.
 *
 * By default this draws the mark inline (no network request, crisp at any
 * size). To use your own artwork instead, drop the file at
 * `frontend/public/logo.png` — or point VITE_LOGO_URL at it — and it is
 * picked up automatically, no code change.
 */
const OVERRIDE = import.meta.env.VITE_LOGO_URL

export default function Logo({ height = 38, className }: { height?: number; className?: string }) {
  if (OVERRIDE) {
    return <img className={className} src={OVERRIDE} alt="WayPoint" height={height} />
  }
  return <LogoMark height={height} className={className} />
}
