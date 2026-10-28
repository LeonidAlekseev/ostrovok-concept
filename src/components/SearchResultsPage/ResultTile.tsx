import { MessageSquareText } from 'lucide-react'
import { cn } from 'cn'
import type { HotelierHotel } from '../../lib/db/claims'
import type { ResultItem } from '../../lib/results'
import { setStayParams, type Stay } from '../../lib/search'
import { DemoBadge } from '../DemoBadge'
import { HotelTile } from '../HotelTile/HotelTile'

interface Props {
  item: ResultItem
  stay: Stay
  active: boolean
  onActivate: (id: string | null) => void
  /** A link of the card is followed to the hotel page. */
  onOpen?: (id: string) => void
  /** The hotel's hotelier told its characteristics: «Сведения отельера», marked «демо» for the demonstration ones. */
  hotelier?: HotelierHotel
}

/**
 * A hotel in the results: links to the hotel page with the same dates and guests; the price and the
 * free cancellation are those of the rate found for the stay.
 */
export function ResultTile({ item, stay, active, onActivate, onOpen, hotelier }: Props) {
  const { hotel, rate, price } = item
  return (
    <HotelTile
      hotel={hotel}
      href={`/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}`}
      price={price}
      freeCancellation={rate.cancellation.kind === 'free'}
      note={
        hotelier && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground-strong">
            <MessageSquareText className="size-4 text-primary" aria-hidden />
            Сведения отельера: {hotelier.facts}
            {hotelier.demo && <DemoBadge />}
          </p>
        )
      }
      data-active={active || undefined}
      onMouseEnter={() => onActivate(hotel.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(hotel.id)}
      onBlur={() => onActivate(null)}
      // The name and the photos are links to the hotel; the favourite and the arrows of the photos are not.
      onClickCapture={(e) => (e.target as Element).closest('a[href]') && onOpen?.(hotel.id)}
      className={cn('ring-2 ring-transparent transition-[box-shadow]', active && 'ring-primary')}
    />
  )
}
