import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { hasFreeCancellation, isRated, type TileHotel } from '../../lib/catalog'
import { formatDecimal } from '../../lib/format'

interface Props {
  hotel: TileHotel
  /** The "Бесплатная отмена" badge; by default, when any rate of the hotel has it. */
  freeCancellation?: boolean
}

/**
 * The line of the card under its name: the guest rating (if any) and the free cancellation; nothing when the hotel
 * has neither. The stars lie on the photo (`PhotoStars`).
 */
export function TileBadges({ hotel, freeCancellation = hasFreeCancellation(hotel) }: Props) {
  const rated = isRated(hotel)
  if (!rated && !freeCancellation) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {rated && (
        <Badge className="bg-primary text-[13px]/5 font-bold text-primary-foreground">
          <span className="sr-only">Оценка гостей </span>
          {formatDecimal(hotel.rating)}
        </Badge>
      )}
      {freeCancellation && (
        <Badge variant="success" className="text-xs/5 [&>svg]:size-3.5">
          <CalendarDays aria-hidden />
          Бесплатная отмена
        </Badge>
      )}
    </div>
  )
}
