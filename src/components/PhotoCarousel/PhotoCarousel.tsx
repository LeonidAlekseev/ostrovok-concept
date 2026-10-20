'use client'

import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Photo } from '@/lib/catalog'

interface Props {
  photos: Photo[]
  /** Where a photo leads; the photos are plain pictures without it or `onOpen`. */
  href?: string
  /** A photo is a button that opens it, e.g. in a full-screen viewer. */
  onOpen?: (index: number) => void
  /** Name of the strip for screen readers. */
  label?: string
  /** Size and shape of the carousel, e.g. an aspect ratio and a radius. */
  className?: string
  /** Badges laid over the photos; they let clicks and swipes through to the photo. */
  children?: ReactNode
}

const arrowClass =
  'absolute top-[calc(50%-1.125rem)] text-foreground opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden'

/**
 * Photos in a snapping strip: swiped on touch screens, turned by the arrows that show on hover and
 * focus elsewhere, with the "1 / N" counter in the bottom left corner.
 */
export function PhotoCarousel({ photos, href, onOpen, label = 'Фото отеля', className, children }: Props) {
  const strip = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = photos.length

  // The arrows go round; the strip scrolls smoothly unless reduced motion is asked for (motion-safe).
  const go = (to: number) => {
    const next = (to + count) % count
    setIndex(next)
    strip.current?.scrollTo({ left: next * strip.current.clientWidth })
  }

  return (
    <div className={cn('group/carousel relative overflow-hidden', className)}>
      <div
        ref={strip}
        role="group"
        aria-label={label}
        className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          // Counted once the strip settles on a photo, so a smooth turn does not flicker through the others.
          const { scrollLeft, clientWidth } = event.currentTarget
          if (!clientWidth) return
          const at = scrollLeft / clientWidth
          if (Math.abs(at - Math.round(at)) < 0.02) setIndex(Math.round(at))
        }}
      >
        {photos.map((photo, i) =>
          href ? (
            // The hotel name is the link for the keyboard and screen readers; the photo only takes the click.
            <Link key={photo.id} href={href} tabIndex={-1} aria-hidden className="size-full shrink-0 snap-start">
              <PhotoPlaceholder photo={photo} className="size-full" />
            </Link>
          ) : onOpen ? (
            <button
              key={photo.id}
              type="button"
              aria-label={`Открыть фото: ${photo.caption}`}
              className="size-full shrink-0 snap-start"
              onClick={() => onOpen(i)}
            >
              <PhotoPlaceholder photo={photo} className="size-full" />
            </button>
          ) : (
            <PhotoPlaceholder key={photo.id} photo={photo} className="size-full shrink-0 snap-start" />
          ),
        )}
      </div>

      {children}

      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-(--decor-light) backdrop-blur-sm">
        <span aria-hidden>
          {index + 1} / {count}
        </span>
        <span className="sr-only">
          Фото {index + 1} из {count}
        </span>
      </span>

      {count > 1 && (
        <>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Предыдущее фото"
            className={cn(arrowClass, 'left-2')}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Следующее фото"
            className={cn(arrowClass, 'right-2')}
            onClick={() => go(index + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </>
      )}
    </div>
  )
}
