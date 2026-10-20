'use client'

import { Bus, CarFront, ChevronRight, MapPin } from 'lucide-react'
import { cn } from 'cn'
import { Separator } from '@/components/ui/separator'
import { getDestination, type Hotel } from '../../lib/catalog'
import { formatDecimal } from '../../lib/format'
import { ratingLabel } from '../../lib/reviews'
import { goToSection } from './goToSection'
import { HotelMapDialog } from './HotelMapDialog'
import { reviewsLabel } from './reviewsLabel'

const tileClass =
  'flex min-w-0 items-center gap-2.5 rounded-xl bg-(--decor-surface-soft) px-3 py-3 text-[clamp(14px,3.9vw,16px)]/snug sm:gap-3 sm:px-4'

/** The nearest metro station, its "М" in the colour of the text; without a metro, the stop of the city transport. */
function TransportTile({ hotel }: { hotel: Hotel }) {
  if (!hotel.metro)
    return (
      <p className={tileClass}>
        <Bus className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
        <span>
          <b>5 мин</b> до остановки транспорта
        </span>
      </p>
    )
  return (
    <p className={tileClass}>
      <span className="w-6 shrink-0 text-center text-2xl/none font-black" aria-hidden>
        М
      </span>
      <span className="flex min-w-0 flex-col">
        <span>
          <b>{hotel.metro.meters} м</b> до метро
        </span>
        <span className="truncate text-sm text-muted-foreground">{hotel.metro.station}</span>
      </span>
    </p>
  )
}

/**
 * The block under the photos: the name (the page's `h1`, or an `h2` with `titleId` inside a dialog),
 * the distance to the centre, the guest rating leading to the reviews, the address, the distance and
 * transport tiles and the hotel on the map.
 */
export function HotelHeader({ hotel, titleId, className }: { hotel: Hotel; titleId?: string; className?: string }) {
  const Title = titleId ? 'h2' : 'h1'
  const distance = `${formatDecimal(hotel.distanceKm)} км`
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-1.5">
        <Title id={titleId} className="text-[clamp(24px,6.5vw,30px)]/tight font-bold tracking-[-0.02em]">
          {hotel.name}
        </Title>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-5 shrink-0" aria-hidden />
          {distance} от центра {getDestination(hotel.destinationId)?.genitive}
        </p>
      </div>
      <Separator />
      <button
        type="button"
        className="flex items-center gap-4 rounded-lg text-left"
        aria-label={`Оценка гостей ${formatDecimal(hotel.rating)}, ${ratingLabel(hotel.rating)}, ${reviewsLabel(hotel.reviewCount)}`}
        onClick={() => goToSection('reviews')}
      >
        {/* The darker green of the system: white text on it stays readable. */}
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-success-foreground text-xl font-bold text-white">
          {formatDecimal(hotel.rating)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg/tight font-bold">{ratingLabel(hotel.rating)}</span>
          <span className="text-muted-foreground">{reviewsLabel(hotel.reviewCount)}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Separator />
      <p className="flex items-center gap-3">
        <MapPin className="size-6 shrink-0" aria-hidden />
        {hotel.address}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <p className={tileClass}>
          <CarFront className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
          <span>
            <b>{distance}</b> до центра
          </span>
        </p>
        <TransportTile hotel={hotel} />
      </div>
      <HotelMapDialog hotel={hotel} />
    </header>
  )
}
