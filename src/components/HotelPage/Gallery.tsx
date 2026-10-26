'use client'

import { useRef, useState } from 'react'
import { cn } from 'cn'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel, Photo } from '@/lib/catalog'
import { PhotoMosaic, type MosaicStart } from './PhotoMosaic'
import { useHistoryDialog } from './useHistoryDialog'

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

/** Width / height of a strip photo until its image has loaded and told its own. */
const STRIP_RATIO = 4 / 3

/** One photo of the phone strip: as high as the strip, as wide as its image (whole, never cropped). */
function StripPhoto({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const [ratio, setRatio] = useState(STRIP_RATIO)
  return (
    <button
      type="button"
      aria-label={`Открыть фото: ${photo.caption}`}
      className="block h-full shrink-0 overflow-hidden rounded-lg"
      style={{ aspectRatio: ratio }}
      onClick={onOpen}
    >
      <PhotoPlaceholder photo={photo} large onRatio={setRatio} className="size-full text-base" />
    </button>
  )
}

const tileButton = 'relative block size-full overflow-hidden rounded-lg'

/**
 * The photos of the hotel, flat. From `md` a tile: one large photo on two rows and up to six beside it
 * (3 × 2), the last with "+N фото" over the rest. On a phone a strip of photos of one height, each as wide as its
 * own proportions, running off both screen edges, with a counter. A photo opens the mosaic at itself, "+N фото" the mosaic as a whole.
 */
export function Gallery({ hotel }: Props) {
  const { photos } = hotel
  const [selected, setSelected] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)
  // The photo under the content line is the current one; the last one once the strip is at its end.
  const onScroll = () => {
    const strip = stripRef.current
    if (!strip) return
    const slides = Array.from(strip.children) as HTMLElement[]
    const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1
    let index = atEnd ? slides.length - 1 : 0
    if (!atEnd) {
      const line = strip.scrollLeft + strip.clientWidth / 2
      index = Math.max(
        0,
        slides.findIndex((el) => el.offsetLeft + el.offsetWidth > line),
      )
    }
    if (index !== selected) setSelected(index)
  }
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
          ref={stripRef}
          onScroll={onScroll}
          className="-mx-(--page-x) flex h-60 touch-pan-x touch-pan-y gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-(--page-x) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, index) => (
            <StripPhoto key={photo.id} photo={photo} onOpen={() => open(index)} />
          ))}
        </div>
        {photos.length > 1 && (
          <p className="pointer-events-none absolute right-(--page-x) bottom-2 m-0 rounded-md bg-black/60 px-2 py-0.5 text-sm font-medium text-white">
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
