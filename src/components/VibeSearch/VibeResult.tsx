import Link from 'next/link'
import { useEffect, useRef, type CSSProperties } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from 'cn'
import { selectionHref, type Stay } from '../../lib/search'
import type { Vibe } from '../../lib/vibe'
import { SmartImage } from '../ui/SmartImage'
import { VibeImage } from './VibeImage'

interface Props {
  vibe: Vibe
  /** `null` until today's date is known: the selection then goes without dates and /search starts from tomorrow. */
  stay: Stay | null
  onRestart: () => void
}

export function VibeResult({ vibe, stay, onRestart }: Props) {
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
              <div className="w-(--left) bg-[image:linear-gradient(135deg,var(--decor-vibe-calm-from),var(--decor-vibe-calm-to))]" />
              <div className="flex-1 bg-[image:linear-gradient(135deg,var(--decor-vibe-loud-from),var(--decor-vibe-loud-to))]" />
            </div>
          </li>
        ))}
      </ul>

      <VibeImage vibe={vibe} />

      {/* The hotels of the vibe are shown on /search, with its filters and map. */}
      <Link
        href={selectionHref({ hotels: vibe.hotels.map((h) => h.id), from: 'vibe', pick: vibe.archetype.id }, stay)}
        className={cn(buttonVariants({ size: 'lg' }), 'h-12 text-base')}
      >
        Посмотреть подборку
        <ArrowRight aria-hidden />
      </Link>

      <Button variant="secondary" size="lg" className="h-12 text-base" onClick={onRestart}>
        <RotateCcw aria-hidden />
        Пройти заново
      </Button>
    </div>
  )
}
