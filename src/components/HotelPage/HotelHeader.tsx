'use client'

import { MapPin, Star } from 'lucide-react'
import { hasStars, isRated, STAY_TYPES, type Hotel } from '../../lib/catalog'
import { countRu } from '../../lib/format'
import { ratingLabel } from '../../lib/reviews'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { GeneratedBadge } from '../GeneratedBadge/GeneratedBadge'
import { goToSection } from './goToSection'
import { reviewsLabel } from './reviewsLabel'
import { ScoreBadge } from './ScoreBadge'
import { ShareButton } from './ShareButton'

/** The id of the page's `h1`: the phone's compact header shows once it scrolls away. */
export const HOTEL_TITLE_ID = 'hotel-title'

/**
 * The hotel above its photos: the name (the page's `h1`) with
 * the round favourite and "Поделиться", then the badge of the kind of stay (the filled stars with
 * "N-звёздочный отель", or a hostel, apartments, a villa) with the «generated» mark of a made-up hotel, the
 * address and the guests' score with its word and the count of reviews, which leads to the rating.
 */
export function HotelHeader({ hotel }: { hotel: Hotel }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <h1 id={HOTEL_TITLE_ID} className="min-w-0 text-title font-bold tracking-[-0.02em]">
          {hotel.name}
        </h1>
        <div className="flex shrink-0 gap-2">
          <FavoriteButton hotelId={hotel.id} className="size-11" />
          <ShareButton hotel={hotel} className="size-11" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-sm text-muted-foreground">
            {hasStars(hotel) && (
              <span
                className="flex items-center gap-0.5"
                role="img"
                aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
              >
                {Array.from({ length: hotel.stars }, (_, i) => (
                  <Star key={i} className="size-3.5 fill-current text-brand-foreground" aria-hidden />
                ))}
              </span>
            )}
            {hotel.stayType === 'hotel' && hotel.stars > 0
              ? `${hotel.stars}-звёздочный отель`
              : STAY_TYPES[hotel.stayType]}
          </span>
          <GeneratedBadge hotel={hotel} />
        </span>
        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {hotel.address}
        </p>
        {isRated(hotel) && (
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg text-left"
            onClick={() => goToSection('rating')}
          >
            <ScoreBadge score={hotel.rating} className="size-10 text-lg" />
            <span className="flex flex-col">
              <b className="text-base/tight">{ratingLabel(hotel.rating)}</b>
              <span className="text-sm text-muted-foreground">{reviewsLabel(hotel.reviewCount)}</span>
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
