'use client'

import { ChevronRight, MapPin } from 'lucide-react'
import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import { formatDecimal } from '@/lib/format'
import { HotelMapDialog } from './HotelMapDialog'

/** Until Ostrovok's places come, every layout shows this instead of the places nearby. */
export const NEARBY_LATER = 'Места рядом появятся позже'

/**
 * A drawn stand-in for the map: streets on the map's tint and the pin. It is not the hotel's map; that one
 * opens in the dialog.
 */
function MapPreview({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden bg-[#e9efe6] dark:bg-muted',
        'bg-[linear-gradient(32deg,transparent_46%,#fff_46%,#fff_50%,transparent_50%),linear-gradient(-58deg,transparent_62%,#fff_62%,#fff_65%,transparent_65%),linear-gradient(90deg,transparent_30%,#fff9_30%,#fff9_32%,transparent_32%)]',
        className,
      )}
    >
      <MapPin className="size-8 fill-primary text-white drop-shadow" strokeWidth={1.6} />
    </span>
  )
}

const kmFromCentre = (hotel: Hotel) => `${formatDecimal(hotel.distanceKm)} км от центра`

/**
 * "Расположение" of the column: the map preview with the address and the kilometres from the centre, opening
 * the map, and the stand-in for the places nearby.
 */
export function HotelLocation({ hotel }: { hotel: Hotel }) {
  return (
    <section id="location" tabIndex={-1} aria-labelledby="location-title" className="flex flex-col gap-4 outline-none">
      <h2 id="location-title" className="text-heading font-bold">
        Расположение
      </h2>
      <HotelMapDialog
        hotel={hotel}
        trigger={
          <button
            type="button"
            aria-label="Показать на карте"
            className="flex items-stretch overflow-hidden rounded-xl bg-card text-left shadow-(--shadow-card) transition-colors hover:bg-secondary"
          >
            <MapPreview className="w-[clamp(110px,30%,220px)] self-stretch" />
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-4">
              <b className="text-base/snug">{hotel.address}</b>
              <span className="text-sm text-muted-foreground">{kmFromCentre(hotel)}</span>
              <span className="mt-1 text-sm font-semibold text-primary">Показать на карте</span>
            </span>
            <ChevronRight className="mr-3 size-5 shrink-0 self-center text-muted-foreground" aria-hidden />
          </button>
        }
      />
      <p className="text-muted-foreground">{NEARBY_LATER}</p>
    </section>
  )
}

/** "Расположение" of the side column: "Показать на карте", the map preview, the address and the places stand-in. */
export function LocationCard({ hotel, className }: { hotel: Hotel; className?: string }) {
  return (
    <section aria-labelledby="location-card-title" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="location-card-title" className="text-lg font-bold">
          Расположение
        </h2>
        <span className="text-sm text-muted-foreground">{kmFromCentre(hotel)}</span>
      </div>
      <HotelMapDialog
        hotel={hotel}
        trigger={
          <button type="button" aria-label="Показать на карте" className="group flex flex-col gap-2 text-left">
            <MapPreview className="h-32 w-full rounded-lg" />
            <span className="text-sm font-semibold text-primary group-hover:underline">Показать на карте</span>
          </button>
        }
      />
      <p className="text-sm">{hotel.address}</p>
      <p className="text-sm text-muted-foreground">{NEARBY_LATER}</p>
    </section>
  )
}
