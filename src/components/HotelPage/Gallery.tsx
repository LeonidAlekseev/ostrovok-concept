'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '@/lib/catalog'
import { PhotoMosaic, type MosaicStart } from './PhotoMosaic'
import { useHistoryDialog } from './useHistoryDialog'
import { useSnapRow } from './useSnapRow'

interface Props {
  hotel: Hotel
  /** Inside the hotel dialog: the photo as wide as the dialog, no header over it. */
  inDialog?: boolean
}

/**
 * One large photo across the screen (or the dialog), fading at the bottom into the background, with a
 * row of thumbnails over its lower edge. The row runs from edge to edge of the screen and starts and
 * ends at the edge of the text. A thumbnail picks the photo, a swipe leafs through them (a native
 * scroll-snapping row), and the large photo opens the mosaic of all the photos at itself.
 */
export function Gallery({ hotel, inDialog = false }: Props) {
  const { photos } = hotel
  const [selected, setSelected] = useState(0)
  const { ref, go, onScroll } = useSnapRow(selected, photos.length, setSelected)
  const mosaic = useHistoryDialog<MosaicStart>()

  return (
    <section aria-label="Фотографии отеля" className="relative">
      <div className="relative">
        <div
          ref={ref}
          onScroll={onScroll}
          className={cn(
            'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            inDialog ? 'h-[clamp(200px,45vw,320px)]' : 'h-[clamp(260px,min(60vh,75vw),640px)]',
          )}
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              // Only the photo on screen takes focus and clicks; the row still scrolls under a finger.
              inert={index !== selected}
              aria-hidden={index !== selected || undefined}
              aria-label={`Открыть фото: ${photo.caption}`}
              className="h-full w-full shrink-0 snap-center snap-always"
              onClick={() => mosaic.open({ tab: 'hotel', index })}
            >
              <PhotoPlaceholder photo={photo} className="size-full text-base" />
            </button>
          ))}
        </div>
        {/* Shade under the transparent header: its white logo and icons stay readable on a light photo. */}
        {!inDialog && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--header-height)+48px)] bg-linear-to-b from-black/50 to-transparent"
          />
        )}
        {/* The photo fades into the background of the page and of the dialog alike. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-linear-to-t from-(--decor-surface-soft) to-transparent"
        />
      </div>
      {/* The padding is the page column's, so the row starts and ends at the edge of the text. */}
      <ul
        className={cn(
          'relative -mt-9 flex snap-x gap-2 overflow-x-auto py-1 [scrollbar-width:none] sm:-mt-12 [&::-webkit-scrollbar]:hidden',
          inDialog
            ? 'scroll-px-4 px-4'
            : 'scroll-px-[calc(max((100%-var(--page-max))/2,0px)+var(--page-x))] px-[calc(max((100%-var(--page-max))/2,0px)+var(--page-x))]',
        )}
      >
        {photos.map((photo, index) => (
          <li key={photo.id} className="shrink-0 snap-start">
            <button
              type="button"
              aria-label={`Фото ${index + 1}: ${photo.caption}`}
              aria-pressed={index === selected}
              className={cn(
                'block h-14 w-20 overflow-hidden rounded-lg border-3 transition-colors sm:h-20 sm:w-28',
                index === selected ? 'border-primary' : 'border-card',
              )}
              onClick={() => go(index)}
            >
              <PhotoPlaceholder photo={photo} className="size-full gap-1 text-xs sm:gap-2 sm:text-sm" />
            </button>
          </li>
        ))}
      </ul>

      <PhotoMosaic hotel={hotel} start={mosaic.value} onClose={mosaic.close} />
    </section>
  )
}
