import { MapPin, Star } from 'lucide-react'
import { countRu } from '../../lib/format'
import type { Hotel } from '../../lib/catalog'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { reviewsLabel } from './reviewsLabel'

/** The hotel name is the page's `h1`, or an `h2` with `titleId` inside a dialog. */
export function HotelHeader({ hotel, titleId }: { hotel: Hotel; titleId?: string }) {
  const Title = titleId ? 'h2' : 'h1'
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <Title id={titleId} className="text-title font-bold tracking-[-0.02em]">
          {hotel.name}
        </Title>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span
            className="flex items-center gap-0.5 text-foreground"
            role="img"
            aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          >
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} className="size-4 fill-current text-brand-foreground" aria-hidden />
            ))}
          </span>
          <span>
            <b className="text-foreground">{hotel.rating.toFixed(1)}</b> · {reviewsLabel(hotel.reviewCount)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {hotel.address}
          </span>
        </div>
      </div>
      <FavoriteButton hotelId={hotel.id} />
    </header>
  )
}
