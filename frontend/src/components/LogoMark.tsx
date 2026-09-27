/**
 * The WayPoint mark: a script "WP" monogram in deep navy with a gold
 * sunrise arc over the P.
 *
 * Drawn inline as SVG so it stays crisp at any size and inherits no external
 * request. If you drop a raster version at `public/logo.png` (or set
 * VITE_LOGO_URL) it is used instead — see the `logoSrc` note in Logo.tsx.
 */

interface Props {
  /** Rendered height in px; width follows the aspect ratio. */
  height?: number
  className?: string
}

const NAVY = '#1B3A6B'
const GOLD = '#C8A45C'

export default function LogoMark({ height = 40, className }: Props) {
  return (
    <svg
      className={className}
      height={height}
      viewBox="0 0 220 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="WayPoint"
    >
      {/* Sunrise rays arcing over the P */}
      <g stroke={GOLD} strokeWidth="3.2" strokeLinecap="round">
        {[-72, -54, -36, -18, 0, 18, 36, 54, 72].map((angle) => {
          const rad = ((angle - 90) * Math.PI) / 180
          const cx = 150
          const cy = 62
          const inner = 40
          const outer = angle % 36 === 0 ? 55 : 49
          return (
            <line
              key={angle}
              x1={cx + Math.cos(rad) * inner}
              y1={cy + Math.sin(rad) * inner}
              x2={cx + Math.cos(rad) * outer}
              y2={cy + Math.sin(rad) * outer}
            />
          )
        })}
      </g>

      {/* Script WP */}
      <text
        x="6"
        y="92"
        fill={NAVY}
        fontFamily="'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive"
        fontSize="78"
        fontStyle="italic"
        letterSpacing="-2"
      >
        WP
      </text>
    </svg>
  )
}
