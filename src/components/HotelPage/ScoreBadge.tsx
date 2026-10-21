import type { CSSProperties } from 'react'
import { cn } from 'cn'
import { formatDecimal } from '../../lib/format'
import { scoreColor, scoreOnDark } from '../../lib/reviews'

/** The score on its colour of the scale: white figures on red and green, dark on yellow. */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      style={{ '--score': scoreColor(score) } as CSSProperties}
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-lg bg-(--score) text-xl font-bold',
        scoreOnDark(score) ? 'text-white' : 'text-foreground',
        className,
      )}
    >
      {formatDecimal(score)}
    </span>
  )
}
