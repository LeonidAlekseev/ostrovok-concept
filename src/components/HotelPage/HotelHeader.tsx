'use client'

import type { ReactNode } from 'react'
import { Bus, CarFront, ChevronRight, MapPin, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getDestination, hasFreeCancellation, type Hotel } from '../../lib/catalog'
import { countRu, formatDecimal } from '../../lib/format'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { ratingLabel } from '../../lib/reviews'
import { goToSection } from './goToSection'
import { HotelMapDialog } from './HotelMapDialog'
import { reviewsLabel } from './reviewsLabel'

const tileClass = 'flex min-w-0 items-center gap-2.5 text-[clamp(14px,3.9vw,16px)]/snug sm:gap-3'

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
 * The hotel on the page's background: the name (the page's `h1`, or an `h2` with `titleId` inside a
 * dialog) with the favourite toggle, the stars, rating, free cancellation and distance to the centre,
 * the address, then the photos (`children`), the guest rating leading to the reviews, the distance and
 * transport and the hotel on the map.
 */
export function HotelHeader({ hotel, titleId, children }: { hotel: Hotel; titleId?: string; children?: ReactNode }) {
  const Title = titleId ? 'h2' : 'h1'
  const distance = `${formatDecimal(hotel.distanceKm)} км`
  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <Title id={titleId} className="min-w-0 text-title font-bold tracking-[-0.02em]">
            {hotel.name}
          </Title>
          <FavoriteButton hotelId={hotel.id} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span
            className="flex items-center gap-0.5"
            role="img"
            aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          >
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} className="size-4 fill-current text-brand-foreground" aria-hidden />
            ))}
          </span>
          <span>
            <b className="text-foreground">{formatDecimal(hotel.rating)}</b> · {reviewsLabel(hotel.reviewCount)}
          </span>
          {hasFreeCancellation(hotel) && <Badge variant="success">Бесплатная отмена</Badge>}
          <span>
            {distance} от центра {getDestination(hotel.destinationId)?.genitive}
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {hotel.address}
        </p>
      </div>
      {children}
      <div className="flex flex-col gap-4">
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
        <div className="grid grid-cols-2 gap-4">
          <p className={tileClass}>
            <CarFront className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
            <span>
              <b>{distance}</b> до центра
            </span>
          </p>
          <div className="border-l border-border pl-4">
            <TransportTile hotel={hotel} />
          </div>
        </div>
        <HotelMapDialog hotel={hotel} />
      </div>
    </header>
  )
}
