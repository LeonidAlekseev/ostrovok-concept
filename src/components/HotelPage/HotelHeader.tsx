'use client'

import { MapPin, Star } from 'lucide-react'
import { hasStars, STAY_TYPES, type Hotel } from '../../lib/catalog'
import { countRu } from '../../lib/format'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { GeneratedBadge } from '../GeneratedBadge/GeneratedBadge'
import { HotelMapDialog } from './HotelMapDialog'

/**
 * The hotel under its photo: the name (the page's `h1`, or an `h2` with `titleId` inside a dialog)
 * with the round favourite toggle, the filled stars with "N-звёздочный отель" (or the type of a hostel, apartments, a villa)
 * and the «generated» mark of a made-up hotel, the address and the hotel on the map.
 */
export function HotelHeader({ hotel, titleId }: { hotel: Hotel; titleId?: string }) {
  const Title = titleId ? 'h2' : 'h1'
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <Title id={titleId} className="min-w-0 text-title font-bold tracking-[-0.02em]">
          {hotel.name}
        </Title>
        <FavoriteButton hotelId={hotel.id} className="size-11" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        {hasStars(hotel) && (
          <span
            className="flex items-center gap-0.5"
            role="img"
            aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          >
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} className="size-4 fill-current text-brand-foreground" aria-hidden />
            ))}
          </span>
        )}
        <span>
          {hotel.stayType === 'hotel' && hotel.stars > 0
            ? `${hotel.stars}-звёздочный отель`
            : STAY_TYPES[hotel.stayType]}
        </span>
        <GeneratedBadge hotel={hotel} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {hotel.address}
        </p>
        <HotelMapDialog hotel={hotel} />
      </div>
    </header>
  )
}
