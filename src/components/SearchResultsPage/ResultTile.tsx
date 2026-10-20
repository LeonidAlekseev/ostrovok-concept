import { cn } from 'cn'
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

/**
 * A hotel in the results: links to the hotel page with the same dates and guests; the price and the
 * free cancellation are those of the rate found for the stay.
 */
export function ResultTile({ item, stay, nights, active, onActivate }: Props) {
  const { hotel, rate } = item
  return (
    <HotelTile
      hotel={hotel}
      href={`/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}`}
      price={offerTotal(rate.pricePerNight, nights, stay.guests.rooms)}
      freeCancellation={rate.cancellation.kind === 'free'}
      data-active={active || undefined}
      onMouseEnter={() => onActivate(hotel.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(hotel.id)}
      onBlur={() => onActivate(null)}
      className={cn('ring-2 ring-transparent transition-[box-shadow]', active && 'ring-primary')}
    />
  )
}
