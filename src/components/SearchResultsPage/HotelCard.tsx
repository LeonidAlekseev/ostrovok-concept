import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { MEAL_LABEL } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { offerTotal } from '../../lib/offer'
import type { ResultItem } from '../../lib/results'
import { setStayParams, type Stay } from '../../lib/search'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'

interface Props {
  /** DOM id of the card, for scrolling to it. */
  id: string
  item: ResultItem
  stay: Stay
  nights: number
  /** Show the city: results of a scenario span several. */
  showCity: boolean
  active: boolean
  onActivate: (id: string | null) => void
}

/** A hotel in the results: the name links to the hotel page with the same dates and guests. */
export function HotelCard({ id, item, stay, nights, showCity, active, onActivate }: Props) {
  const { hotel, destination, rate } = item
  const href = `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}`
  const total = offerTotal(rate.pricePerNight, nights, stay.guests.rooms)
  const rooms = stay.guests.rooms > 1 ? `, ${countRu(stay.guests.rooms, ['номер', 'номера', 'номеров'])}` : ''
  return (
    <article
      id={id}
      data-active={active || undefined}
      onMouseEnter={() => onActivate(hotel.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(hotel.id)}
      onBlur={() => onActivate(null)}
      className={cn(
        'relative grid scroll-mt-24 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3 rounded-2xl bg-card p-2 shadow-(--shadow-card) ring-2 ring-transparent transition-[box-shadow] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4',
        active && 'ring-primary',
      )}
    >
      <PhotoPlaceholder photo={hotel.photos[0]} className="min-h-28 rounded-xl sm:min-h-40" />
      <FavoriteButton hotelId={hotel.id} className="absolute top-4 left-4 z-10" />

      <div className="flex min-w-0 flex-col gap-1.5 py-1 pr-1">
        <h3 className="text-lg/[1.25] font-[650]">
          {/* The link covers the card; the favourite button sits above it. */}
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary"
          >
            {hotel.name}
          </Link>
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm/[normal] text-muted-foreground">
          <span className="flex text-(--decor-star)" aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}>
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
            ))}
          </span>
          {showCity && <span>{destination.name}</span>}
          <span>{formatDecimal(hotel.distanceKm)} км до центра</span>
        </p>
        <p className="flex items-center gap-2 text-sm/[normal]">
          <Badge className="bg-primary text-primary-foreground">{formatDecimal(hotel.rating)}</Badge>
          <span className="text-muted-foreground">{countRu(hotel.reviewCount, ['отзыв', 'отзыва', 'отзывов'])}</span>
        </p>
        <p className="flex flex-wrap gap-1.5">
          {rate.cancellation.kind === 'free' && <Badge variant="success">Бесплатная отмена</Badge>}
          <Badge variant="secondary">{MEAL_LABEL[rate.meal]}</Badge>
        </p>
        <p className="mt-auto text-right">
          <span className="block text-lg/[normal] font-bold">от {formatPrice(total)}</span>
          <span className="block text-sm/[normal] text-muted-foreground">
            за {countRu(nights, ['ночь', 'ночи', 'ночей'])}
            {rooms}
          </span>
        </p>
      </div>
    </article>
  )
}
