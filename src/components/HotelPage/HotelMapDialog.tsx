'use client'

import dynamic from 'next/dynamic'
import { Map as MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Hotel } from '@/lib/catalog'
import { DialogButton } from './DialogButton'
import { HotelMapUnavailable } from './HotelMapUnavailable'

// MapLibre is loaded only when the map opens, and only in the browser.
const HotelMap = dynamic(() => import('./HotelMap').catch(() => ({ default: HotelMapUnavailable })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

/** "Показать на карте": a dialog with the hotels of the city on the map, this one marked above the rest. */
export function HotelMapDialog({ hotel }: { hotel: Hotel }) {
  return (
    <Dialog>
      <DialogButton icon={MapIcon}>Показать на карте</DialogButton>
      <DialogContent showCloseButton={false} className="gap-3 text-base sm:max-w-2xl">
        <DialogTitle className="text-lg">{hotel.name}</DialogTitle>
        <DialogDescription>{hotel.address}</DialogDescription>
        <div className="h-[min(60dvh,28rem)] overflow-hidden rounded-lg">
          <HotelMap hotel={hotel} />
        </div>
        <DialogClose render={<Button variant="outline" className="justify-self-end" />}>Закрыть</DialogClose>
      </DialogContent>
    </Dialog>
  )
}
