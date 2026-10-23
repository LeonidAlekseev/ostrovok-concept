import { useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Stay } from '../../lib/search'
import type { RouteCardData } from '../../lib/routes'
import type { Vibe } from '../../lib/vibe'
import { SmartImage } from '../ui/SmartImage'
import { ReadyRoute } from '../RouteCard/ReadyRoute'
import { VibeHotels } from './VibeHotels'
import { VibeImage } from './VibeImage'

interface Props {
  vibe: Vibe
  /** The ready-made route over the hotels; none without routes. */
  route: RouteCardData | null
  /** `null` until today's date is known: the links go without dates and the hotel page asks for them. */
  stay: Stay | null
  onRestart: () => void
}

export function VibeResult({ vibe, route, stay, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // The pairs are gone: the focus moves to the result.
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted shadow-(--shadow-card)">
        <SmartImage src={vibe.archetype.image} alt="" width={800} height={600} className="size-full object-cover" />
        <div className="absolute inset-0 bg-(image:--decor-vibe-shade)" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-4 text-(--decor-light)">
          <p className="text-sm font-semibold opacity-90">Ваш вайб</p>
          <h3 ref={headingRef} tabIndex={-1} className="text-[clamp(22px,6vw,32px)]/[1.2] font-extrabold outline-none">
            {vibe.archetype.name}
          </h3>
          <p className="mt-1 text-[15px]">{vibe.archetype.description}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5" aria-label="Статистика вайба">
        {vibe.shares.map(({ axis, left, right }) => (
          <li key={axis.id} className="flex flex-col gap-1">
            <p className="flex justify-between gap-3 text-sm">
              <span className={left >= right ? 'font-semibold' : 'text-muted-foreground'}>
                {axis.left} {left}%
              </span>
              <span className={right >= left ? 'text-right font-semibold' : 'text-right text-muted-foreground'}>
                {right}% {axis.right}
              </span>
            </p>
            <div
              aria-hidden
              className="flex h-2 overflow-hidden rounded-full bg-muted"
              style={{ '--left': `${left}%` } as CSSProperties}
            >
              <div className="w-(--left) bg-(image:--decor-vibe-calm)" />
              <div className="flex-1 bg-(image:--decor-vibe-loud)" />
            </div>
          </li>
        ))}
      </ul>

      <VibeImage vibe={vibe} />

      <ReadyRoute route={route} />

      <VibeHotels hotels={vibe.hotels} stay={stay} />

      <Button variant="secondary" size="lg" className="h-12 text-base" onClick={onRestart}>
        <RotateCcw aria-hidden />
        Пройти заново
      </Button>
    </div>
  )
}
