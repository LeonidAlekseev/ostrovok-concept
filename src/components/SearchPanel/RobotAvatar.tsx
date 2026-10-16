import { useId } from 'react'

/** The assistant's face: a friendly robot drawn inline, so it needs no image request. */
export function RobotAvatar({ className }: { className?: string }) {
  // Gradient ids must be unique per instance: a copy inside a hidden panel would break shared ones.
  const id = useId()
  const bg = `${id}bg`
  const head = `${id}head`
  const visor = `${id}visor`
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden>
      <defs>
        <radialGradient id={bg} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#eef3ff" />
          <stop offset="1" stopColor="#d9e4ff" />
        </radialGradient>
        <linearGradient id={head} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe6fb" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2a5c" />
          <stop offset="1" stopColor="#0b1233" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="48" fill={`url(#${bg})`} />
      <line x1="48" y1="22" x2="48" y2="13" stroke="#8ea3e8" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="48" cy="11" r="4.5" fill="#6d8cf5" />
      <rect x="15" y="40" width="8" height="18" rx="4" fill="#8ea3e8" />
      <rect x="73" y="40" width="8" height="18" rx="4" fill="#8ea3e8" />
      <rect x="20" y="22" width="56" height="48" rx="22" fill={`url(#${head})`} stroke="#c9d5f7" strokeWidth="1.5" />
      <rect x="27" y="31" width="42" height="30" rx="14" fill={`url(#${visor})`} />
      <ellipse cx="39" cy="44" rx="4" ry="5" fill="#5ee7ff" />
      <ellipse cx="57" cy="44" rx="4" ry="5" fill="#5ee7ff" />
      <path d="M42 52.5q6 4.5 12 0" fill="none" stroke="#5ee7ff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M30 78q18-10 36 0v18H30z" fill={`url(#${head})`} stroke="#c9d5f7" strokeWidth="1.5" />
    </svg>
  )
}
