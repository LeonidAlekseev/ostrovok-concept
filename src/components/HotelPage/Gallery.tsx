'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '@/lib/catalog'

interface Props {
  hotel: Hotel
  /** Inside the hotel dialog: the photo as wide as the dialog, no header over it. */
  inDialog?: boolean
}

/**
 * One large photo across the screen (or the dialog) with a row of thumbnails over its lower edge.
 * A thumbnail picks the photo, a swipe leafs through them (a native scroll-snapping row), and the
 * large photo opens the full-screen viewer.
 */
export function Gallery({ hotel, inDialog = false }: Props) {
  const { name: hotelName, photos } = hotel
  const [selected, setSelected] = useState(0)
  // `null`: the viewer is closed. Focus goes back to the large photo (Base UI restores the previous focus).
  const [current, setCurrent] = useState<number | null>(null)
  const track = useRef<HTMLDivElement>(null)
  // The photo a thumbnail scrolls to: the photos passed on the way do not select their thumbnails.
  const target = useRef<number | null>(null)

  const select = (index: number) => {
    setSelected(index)
    const row = track.current
    if (!row) return
    target.current = index
    row.scrollTo?.({ left: index * row.clientWidth, behavior: 'smooth' })
  }

  const onScroll = () => {
    const row = track.current
    if (!row || !row.clientWidth) return
    const index = Math.round(row.scrollLeft / row.clientWidth)
    if (target.current !== null) {
      if (index === target.current) target.current = null
      return
    }
    if (index !== selected && photos[index]) setSelected(index)
  }

  const move = (delta: number) => setCurrent((i) => (i === null ? i : (i + delta + photos.length) % photos.length))
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') move(-1)
    else if (event.key === 'ArrowRight') move(1)
    else return
    event.preventDefault()
  }

  return (
    <section aria-label="Фотографии отеля" className="relative">
      <div
        ref={track}
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
            onClick={() => setCurrent(index)}
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
      <div className={cn('relative mx-auto -mt-9 sm:-mt-12', inDialog ? 'px-4' : 'max-w-(--page-max) px-(--page-x)')}>
        <ul className="flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((photo, index) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Фото ${index + 1}: ${photo.caption}`}
                aria-pressed={index === selected}
                className={cn(
                  'block h-14 w-20 overflow-hidden rounded-lg border-3 transition-colors sm:h-20 sm:w-28',
                  index === selected ? 'border-primary' : 'border-card',
                )}
                onClick={() => select(index)}
              >
                <PhotoPlaceholder photo={photo} className="size-full gap-1 text-xs sm:gap-2 sm:text-sm" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={current !== null} onOpenChange={(open) => !open && setCurrent(null)}>
        <DialogContent showCloseButton={false} className="gap-3 sm:max-w-3xl" onKeyDown={onKeyDown}>
          {current !== null && (
            <>
              <DialogTitle>{hotelName}</DialogTitle>
              <DialogDescription>
                Фото {current + 1} из {photos.length}: {photos[current].caption}
              </DialogDescription>
              <PhotoPlaceholder photo={photos[current]} className="h-[min(60vh,28rem)] w-full rounded-lg" />
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="icon-sm" aria-label="Предыдущее фото" onClick={() => move(-1)}>
                  <ChevronLeft aria-hidden />
                </Button>
                <DialogClose render={<Button variant="outline" />}>
                  <X aria-hidden />
                  Закрыть
                </DialogClose>
                <Button variant="outline" size="icon-sm" aria-label="Следующее фото" onClick={() => move(1)}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
