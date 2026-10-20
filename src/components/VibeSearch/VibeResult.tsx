import { useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Hotel } from '../../lib/catalog'
import { setStayParams, type Stay } from '../../lib/search'
import type { Vibe } from '../../lib/vibe'
import { HotelTile } from '../HotelTile/HotelTile'
import { VibeImage } from './VibeImage'

interface Props {
  vibe: Vibe
  /** `null` until today's date is known: the links go without dates and the hotel page asks for them. */
  stay: Stay | null
  onRestart: () => void
}

export function VibeResult({ vibe, stay, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const hrefOf = (hotel: Hotel) =>
    stay ? `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}` : `/hotels/${hotel.id}`

  // The pairs are gone: the focus moves to the result.
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-[image:linear-gradient(100deg,var(--decor-vibe-calm-from),var(--decor-vibe-calm-to),var(--decor-vibe-loud-from),var(--decor-vibe-loud-to))] p-4 text-primary-foreground">
        <p className="text-sm font-semibold opacity-90">Ваш вайб</p>
        <h3 ref={headingRef} tabIndex={-1} className="text-[clamp(22px,6vw,28px)]/[1.2] font-extrabold outline-none">
          {vibe.archetype.name}
        </h3>
        <p className="mt-1 text-[15px]">{vibe.archetype.description}</p>
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

      <section aria-labelledby="vibe-hotels" className="flex flex-col gap-2">
        {/* Not a heading: HotelTile goes down to h4, so the hotels stay on the level of the vibe. */}
        <p id="vibe-hotels" className="font-semibold">
          Отели под настроение
        </p>
        {/* Two columns from sm: narrower cards cut off the favourite button. */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {vibe.hotels.map((hotel) => (
            <li key={hotel.id}>
              <HotelTile hotel={hotel} href={hrefOf(hotel)} heading="h4" />
            </li>
          ))}
        </ul>
      </section>

      <Button variant="secondary" size="lg" className="h-12 text-base" onClick={onRestart}>
        <RotateCcw aria-hidden />
        Пройти заново
      </Button>
    </div>
  )
}
