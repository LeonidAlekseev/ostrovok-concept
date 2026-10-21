'use client'

import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Hotel } from '@/lib/catalog'
import { PhotoViewer } from './PhotoViewer'

export type MosaicTab = 'hotel' | 'guests'

/** Where the mosaic opens: the tab and the photo it is scrolled to and focused on. */
export interface MosaicStart {
  tab: MosaicTab
  index: number
}

interface Props {
  hotel: Pick<Hotel, 'name' | 'photos' | 'guestPhotos'>
  /** `null`: the mosaic is closed. */
  start: MosaicStart | null
  onClose: () => void
}

/**
 * The tile of a photo in the repeating pattern of six: a pair, one wide, then a tall one on the left
 * beside two stacked on the right. A block cut short ends in pairs, an odd photo out wide.
 */
function tileClass(index: number, count: number): string {
  const place = index % 6
  const inBlock = count - (index - place)
  const wide = 'col-span-2 aspect-2/1'
  if (place === 2) return wide
  if (place < 2) return inBlock === 1 ? wide : 'aspect-4/3'
  if (inBlock >= 6) return place === 3 ? 'row-span-2' : 'aspect-4/3'
  return inBlock === 4 ? wide : 'aspect-4/3'
}

/**
 * All the photos of the hotel in a full-screen window: the tabs «Фотографии отеля • N» and
 * «Фотографии гостей • M» (none without guest photos), each a mosaic whose photo opens the viewer.
 */
export function PhotoMosaic({ hotel, start, onClose }: Props) {
  const { name, photos, guestPhotos } = hotel
  const [tab, setTab] = useState<MosaicTab>('hotel')
  const [viewed, setViewed] = useState<number | null>(null)
  // Each opening starts on its own tab and photo.
  const [opened, setOpened] = useState(start)
  if (start !== opened) {
    setOpened(start)
    if (start) {
      setTab(start.tab)
      setViewed(null)
    }
  }
  const startTile = useRef<HTMLButtonElement>(null)

  const tabs = [
    { value: 'hotel' as const, label: 'Фотографии отеля', photos },
    ...(guestPhotos.length ? [{ value: 'guests' as const, label: 'Фотографии гостей', photos: guestPhotos }] : []),
  ]
  const current = tabs.find((t) => t.value === tab) ?? tabs[0]

  return (
    <Dialog open={start !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        initialFocus={() => {
          startTile.current?.scrollIntoView?.({ block: 'center' })
          return startTile.current
        }}
        className="inset-0 flex h-dvh w-screen max-w-none translate-0 flex-col gap-0 rounded-none bg-background p-0 text-base ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{name}: фотографии</DialogTitle>
        <Tabs
          value={current.value}
          onValueChange={(value) => setTab(value as MosaicTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* On a phone the cross takes a row of its own above the tabs, which share the width. */}
          <div className="flex flex-col-reverse border-b border-border px-(--page-x) sm:flex-row sm:items-end sm:gap-2">
            <TabsList className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden">
              {tabs.map(({ value, label, photos }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="-mb-px cursor-pointer border-b-2 border-transparent py-3 text-sm font-medium whitespace-nowrap text-muted-foreground max-sm:flex-1 sm:shrink-0 sm:text-base data-active:border-primary data-active:text-foreground"
                >
                  {label} • {photos.length}
                </TabsTrigger>
              ))}
            </TabsList>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1 -mr-2 shrink-0 self-end sm:mt-0 sm:mr-0 sm:mb-1.5"
                />
              }
            >
              <X aria-hidden />
              <span className="sr-only">Закрыть</span>
            </DialogClose>
          </div>
          {tabs.map(({ value, label, photos }) => (
            <TabsContent key={value} value={value} className="min-h-0 flex-1 overflow-y-auto outline-none">
              <ul aria-label={label} className="mx-auto grid max-w-4xl grid-cols-2 gap-1 px-(--page-x) py-4 sm:gap-2">
                {photos.map((photo, index) => (
                  <li key={photo.id} className={tileClass(index, photos.length)}>
                    <button
                      ref={start && value === start.tab && index === start.index ? startTile : undefined}
                      type="button"
                      aria-label={`Открыть фото ${index + 1}: ${photo.caption}`}
                      className="block size-full overflow-hidden rounded-md"
                      onClick={() => setViewed(index)}
                    >
                      <PhotoPlaceholder photo={photo} className="size-full" />
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
        <PhotoViewer title={name} photos={current.photos} index={viewed} onIndexChange={setViewed} />
      </DialogContent>
    </Dialog>
  )
}
