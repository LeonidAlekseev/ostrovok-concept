'use client'

import dynamic from 'next/dynamic'
import { ChevronRight, Map as MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Hotel } from '@/lib/catalog'
import { HotelMapUnavailable } from './HotelMapUnavailable'

// MapLibre is loaded only when the map opens, and only in the browser.
const HotelMap = dynamic(() => import('./HotelMap').catch(() => ({ default: HotelMapUnavailable })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

/** "Показать на карте": a dialog with the map around the hotel's marker. */
export function HotelMapDialog({ hotel }: { hotel: Hotel }) {
  return (
    <Dialog>
      <DialogTrigger className="flex items-center gap-3 rounded-lg text-left font-semibold text-primary">
        <MapIcon className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="flex-1">Показать на карте</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </DialogTrigger>
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
