'use client'

import { useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '@/lib/catalog'
import { PhotoBadges } from '../HotelTile/PhotoBadges'
import { PhotoCarousel } from '../PhotoCarousel/PhotoCarousel'

const GRID_PHOTOS = 5

/**
 * The photos with the badges of the hotel card: its carousel on phones, five photos in a grid from
 * `md` with the badges on the main one. A photo opens the full-screen viewer.
 */
export function Gallery({ hotel }: { hotel: Hotel }) {
  const { name: hotelName, photos } = hotel
  // `null`: the viewer is closed. Focus goes back to the photo that opened it (Base UI restores the previous focus).
  const [current, setCurrent] = useState<number | null>(null)
  const shown = photos.slice(0, GRID_PHOTOS)

  const move = (delta: number) => setCurrent((i) => (i === null ? i : (i + delta + photos.length) % photos.length))
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') move(-1)
    else if (event.key === 'ArrowRight') move(1)
    else return
    event.preventDefault()
  }

  return (
    <section aria-label="Фотографии отеля" className="rounded-2xl bg-card p-2">
      <PhotoCarousel
        photos={photos}
        onOpen={setCurrent}
        className="@container aspect-[4/3] w-full rounded-xl md:hidden"
      >
        <PhotoBadges hotel={hotel} />
      </PhotoCarousel>
      <div className="hidden h-96 grid-cols-4 grid-rows-2 gap-2 md:grid">
        {shown.map((photo, index) => (
          <div
            key={photo.id}
            className={cn('relative overflow-hidden rounded-xl', index === 0 && '@container col-span-2 row-span-2')}
          >
            <button
              type="button"
              aria-label={`Открыть фото: ${photo.caption}`}
              className="size-full"
              onClick={() => setCurrent(index)}
            >
              <PhotoPlaceholder photo={photo} className="size-full transition-opacity hover:opacity-90" />
            </button>
            {index === 0 && <PhotoBadges hotel={hotel} />}
          </div>
        ))}
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
