import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { MEAL_LABEL } from '../../lib/catalog'
import { countRu, formatDecimal } from '../../lib/format'
import { offerTotal } from '../../lib/offer'
import type { ResultItem } from '../../lib/results'
import { setStayParams, type Stay } from '../../lib/search'
import { HotelTile } from '../HotelTile/HotelTile'

interface Props {
  item: ResultItem
  stay: Stay
  nights: number
  active: boolean
  onActivate: (id: string | null) => void
}

/** A hotel in the results: links to the hotel page with the same dates and guests; the price is for the stay. */
export function ResultTile({ item, stay, nights, active, onActivate }: Props) {
  const { hotel, rate } = item
  return (
    <HotelTile
      hotel={hotel}
      href={`/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}`}
      price={offerTotal(rate.pricePerNight, nights, stay.guests.rooms)}
      data-active={active || undefined}
      onMouseEnter={() => onActivate(hotel.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(hotel.id)}
      onBlur={() => onActivate(null)}
      className={cn('ring-2 ring-transparent transition-[box-shadow]', active && 'ring-primary')}
    >
      <div className="flex flex-col gap-1.5 text-sm/[normal]">
        <p className="flex flex-col text-muted-foreground">
          <span>{formatDecimal(hotel.distanceKm)} км до центра</span>
          <span>{countRu(hotel.reviewCount, ['отзыв', 'отзыва', 'отзывов'])}</span>
        </p>
        <p className="flex flex-wrap gap-1.5">
          {rate.cancellation.kind === 'free' && <Badge variant="success">Бесплатная отмена</Badge>}
          <Badge variant="secondary">{MEAL_LABEL[rate.meal]}</Badge>
        </p>
      </div>
    </HotelTile>
  )
}
