'use client'

import type { KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Photo } from '@/lib/catalog'
import { useSnapRow } from './useSnapRow'

interface Props {
  title: string
  photos: Photo[]
  /** The photo on screen; `null`: the viewer is closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

/**
 * The full-screen viewer of a set of photos: ←/→, the arrow buttons and a swipe leaf through them,
 * Escape and "Закрыть" close it, and Base UI returns focus to the photo that opened it.
 */
export function PhotoViewer({ title, photos, index, onIndexChange }: Props) {
  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent showCloseButton={false} className="gap-3 sm:max-w-3xl">
        {index !== null && <Slides title={title} photos={photos} index={index} onIndexChange={onIndexChange} />}
      </DialogContent>
    </Dialog>
  )
}

function Slides({ title, photos, index, onIndexChange }: Props & { index: number }) {
  const { ref, go, onScroll } = useSnapRow(index, photos.length, onIndexChange)
  const move = (delta: number) => go((index + delta + photos.length) % photos.length)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') move(-1)
    else if (event.key === 'ArrowRight') move(1)
    else return
    event.preventDefault()
  }

  return (
    <div className="grid gap-3" onKeyDown={onKeyDown}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        Фото {index + 1} из {photos.length}: {photos[index].caption}
      </DialogDescription>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex h-[min(60vh,28rem)] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            inert={i !== index}
            aria-hidden={i !== index || undefined}
            className="w-full shrink-0 snap-center snap-always"
          >
            <PhotoPlaceholder photo={photo} large className="size-full" />
          </div>
        ))}
      </div>
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
    </div>
  )
}
