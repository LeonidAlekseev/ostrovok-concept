import { useId } from 'react'
import { cn } from 'cn'

/** The GURU mark: a four-point spark in the GURU gradient and the word in the primary colour. */
export function GuruLogo({ className }: { className?: string }) {
  const gradient = useId()
  return (
    <span
      role="img"
      aria-label="GURU"
      className={cn('inline-flex items-center gap-0.5 font-extrabold tracking-tight text-primary', className)}
    >
      <svg viewBox="0 0 24 24" className="size-[1.25em]" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" className="[stop-color:var(--decor-guru-from)]" />
            <stop offset="0.5" className="[stop-color:var(--decor-guru-via)]" />
            <stop offset="1" className="[stop-color:var(--decor-guru-to)]" />
          </linearGradient>
        </defs>
        <path d="M12 0Q13.5 10.5 24 12Q13.5 13.5 12 24Q10.5 13.5 0 12Q10.5 10.5 12 0Z" fill={`url(#${gradient})`} />
      </svg>
      GURU
    </span>
  )
}
