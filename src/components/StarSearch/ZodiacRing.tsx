import { cn } from 'cn'

const signs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']
// Rounded to 3 digits so the server and the client print the same attributes.
const round = (n: number) => Number(n.toFixed(3))
const polar = (angle: number, r: number) => [round(Math.sin(angle) * r), round(-Math.cos(angle) * r)] as const

/**
 * The golden zodiac circle around the orb: 12 divisions with their signs, and an orbit with two planets.
 * Decorative. The circle, signs included, turns slowly around the viewBox centre (the orb's centre) unless
 * the user prefers less motion; the orbit stays put.
 */
export function ZodiacRing({ className }: { className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" aria-hidden className={cn('text-(--decor-gold)', className)}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        className="origin-[0_0] [transform-box:view-box] motion-safe:animate-zodiac-spin"
      >
        <circle r="86" />
        <circle r="66" strokeOpacity="0.6" />
        {signs.map((sign, i) => {
          const [x1, y1] = polar((i * Math.PI) / 6, 66)
          const [x2, y2] = polar((i * Math.PI) / 6, 86)
          const [tx, ty] = polar(((i + 0.5) * Math.PI) / 6, 76.5)
          return (
            <g key={sign}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.7" />
              {/* Engraved on the ring: the top of the sign looks outwards and it turns with the circle. */}
              <text
                x={tx}
                y={ty}
                transform={`rotate(${(i + 0.5) * 30} ${tx} ${ty})`}
                fill="currentColor"
                stroke="none"
                fontSize="10"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols','Noto Sans Symbols 2',sans-serif"
              >
                {`${sign}︎`}
              </text>
            </g>
          )
        })}
      </g>
      <g fill="currentColor" stroke="currentColor" transform="rotate(-6)">
        <ellipse rx="96" ry="27" fill="none" strokeWidth="0.6" />
        <circle cx="-86" cy="9" r="4" stroke="none" />
        <circle cx="90" cy="-8" r="3" stroke="none" />
      </g>
    </svg>
  )
}
