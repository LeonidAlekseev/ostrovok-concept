import { useId } from 'react'

/**
 * Clouds along the lower limb and the sides of the globe, in percent of the globe box. Only the left half of
 * the box is on a phone's screen, and the hero ends a little below the middle of the globe: the clouds stay
 * within that. Negative delays start each cloud at its own point of the drift.
 */
const CLOUDS = [
  { place: 'top-[36%] -left-[14%] w-[30%] md:top-[38%]', drift: '[animation-delay:-4s]' },
  {
    place: 'top-[44%] left-[8%] w-[36%] md:top-[47%]',
    drift: '[animation-delay:-11s] [animation-direction:alternate-reverse]',
  },
  { place: 'top-[48%] left-[38%] w-[30%] max-md:hidden', drift: '[animation-delay:-2s]' },
  { place: 'top-[46%] left-[64%] w-[34%]', drift: '[animation-delay:-15s] [animation-direction:alternate-reverse]' },
  { place: 'top-[24%] left-[86%] w-[24%]', drift: '[animation-delay:-8s]' },
]

/**
 * Fluffy clouds overlapping the edge of the globe. Purely decorative: hidden from assistive technology, they let
 * every press through to the globe and the pins, which are painted above them.
 */
export function GlobeClouds() {
  return CLOUDS.map(({ place, drift }, i) => (
    <div key={i} className={`pointer-events-none absolute ${place}`} aria-hidden>
      <Cloud className={`animate-cloud-drift motion-reduce:animate-none ${drift}`} />
    </div>
  ))
}

/** A cloud of overlapping puffs, white on top and shaded underneath, with a soft shadow below. */
function Cloud({ className }: { className: string }) {
  const fill = useId()
  return (
    <svg
      className={`block h-auto w-full overflow-visible drop-shadow-[0_10px_14px_color-mix(in_srgb,var(--decor-cloud-shadow)_22%,transparent)] ${className}`}
      viewBox="0 0 240 120"
    >
      <defs>
        {/* In user space, so the puffs share one gradient instead of each getting its own. */}
        <linearGradient id={fill} x1="0" y1="10" x2="0" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0.45" style={{ stopColor: 'var(--decor-light)' }} />
          <stop offset="1" style={{ stopColor: 'var(--decor-cloud-shade)' }} />
        </linearGradient>
      </defs>
      <g fill={`url(#${fill})`}>
        <circle cx="22" cy="94" r="16" />
        <circle cx="46" cy="80" r="28" />
        <circle cx="80" cy="60" r="34" />
        <circle cx="122" cy="48" r="42" />
        <circle cx="164" cy="60" r="36" />
        <circle cx="198" cy="80" r="28" />
        <circle cx="222" cy="94" r="16" />
        <ellipse cx="122" cy="94" rx="104" ry="18" />
      </g>
    </svg>
  )
}
