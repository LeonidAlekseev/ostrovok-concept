'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel, Photo } from '@/lib/catalog'
import { PhotoMosaic, type MosaicStart } from './PhotoMosaic'
import { useHistoryDialog } from './useHistoryDialog'
import { useSnapRow } from './useSnapRow'

interface Props {
  hotel: Hotel
}

/** The photos the tile shows: one large and up to six beside it. */
const TILE_SMALL = 6

/** Columns of the grid beside the large photo for `count` small photos, so no cell stays empty. */
const smallColumns = [0, 1, 1, 2, 2, 3, 3]

/** How a small photo sits in its grid: a lone photo is as tall as the large one, an odd one out is wide. */
function smallClass(index: number, count: number): string {
  if (count === 1) return 'row-span-2'
  if (count === 3 && index === 0) return 'col-span-2'
  if (count === 5 && index === 4) return 'col-span-2'
  return ''
}

const tileButton = 'relative block size-full overflow-hidden rounded-lg'

/**
 * The photos of the hotel, flat. From `md` a tile: one large photo on two rows and up to six beside it
 * (3 × 2), the last with "+N фото" over the rest. On a phone a plain carousel as wide as the content with a
 * counter. A photo opens the mosaic at itself, "+N фото" the mosaic as a whole.
 */
export function Gallery({ hotel }: Props) {
  const { photos } = hotel
  const [selected, setSelected] = useState(0)
  const { ref, onScroll } = useSnapRow(selected, photos.length, setSelected)
  const mosaic = useHistoryDialog<MosaicStart>()

  const small = photos.slice(1, 1 + TILE_SMALL)
  const hidden = photos.length - 1 - TILE_SMALL
  const open = (index: number) => mosaic.open({ tab: 'hotel', index })
  const photoButton = (photo: Photo, index: number, large = false) => (
    <button
      key={photo.id}
      type="button"
      aria-label={`Фото ${index + 1}: ${photo.caption}`}
      className={tileButton}
      onClick={() => open(index)}
    >
      <PhotoPlaceholder photo={photo} large={large} className="size-full" />
    </button>
  )

  return (
    <section aria-label="Фотографии отеля">
      <div className="relative md:hidden">
        <div
          ref={ref}
          onScroll={onScroll}
          className="flex aspect-4/3 snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              onClick={() => open(index)}
            >
              <PhotoPlaceholder photo={photo} large className="size-full text-base" />
            </button>
          ))}
        </div>
        {photos.length > 1 && (
          <p className="pointer-events-none absolute right-2 bottom-2 m-0 rounded-md bg-black/60 px-2 py-0.5 text-sm font-medium text-white">
            {selected + 1} / {photos.length}
          </p>
        )}
      </div>

      <div
        className="hidden h-[clamp(280px,32vw,460px)] gap-1.5 md:grid"
        style={{ gridTemplateColumns: small.length ? `2fr ${smallColumns[small.length]}fr` : '1fr' }}
      >
        <div>{photoButton(photos[0], 0, true)}</div>
        {small.length > 0 && (
          <div
            className="grid grid-rows-2 gap-1.5"
            style={{ gridTemplateColumns: `repeat(${smallColumns[small.length]}, minmax(0, 1fr))` }}
          >
            {small.map((photo, i) => (
              <div key={photo.id} className={cn('relative min-h-0', smallClass(i, small.length))}>
                {photoButton(photo, i + 1)}
                {hidden > 0 && i === small.length - 1 && (
                  <button
                    type="button"
                    aria-label={`Ещё ${hidden} фото: открыть все`}
                    className="absolute inset-0 grid place-items-center rounded-lg bg-black/55 text-base font-semibold text-white"
                    onClick={() => open(0)}
                  >
                    +{hidden} фото
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <PhotoMosaic hotel={hotel} start={mosaic.value} onClose={mosaic.close} />
    </section>
  )
}
