import { CalendarDays, Star } from 'lucide-react'
import { cn } from 'cn'
import { hasFreeCancellation, hasStars, isRated, type TileHotel } from '../../lib/catalog'
import { countRu, formatDecimal } from '../../lib/format'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'

interface Props {
  hotel: TileHotel
  /** The "Бесплатная отмена" badge; by default, when any rate of the hotel has it. */
  freeCancellation?: boolean
}

// The light green of the system behind the badges on the photo.
const badgeClass = 'bg-success-soft/90 text-success-foreground backdrop-blur-sm'

/**
 * The badges laid over a hotel photo inside an `@container`: the free cancellation, the guest rating
 * (if any) and the favourite toggle on top, the stars in the bottom right corner; none for apartments and villas. Only the toggle takes clicks.
 */
export function PhotoBadges({ hotel, freeCancellation = hasFreeCancellation(hotel) }: Props) {
  return (
    <>
      {/* The badges shrink on narrow photos; there the free cancellation wraps rather than run under the rating. */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start gap-1.5">
        {freeCancellation && (
          <span
            className={cn(
              'flex min-h-8 min-w-0 items-center gap-1 rounded-full px-2 py-1 text-[11px]/tight font-semibold @[18rem]:min-h-9 @[18rem]:gap-1.5 @[18rem]:px-3 @[18rem]:text-xs',
              badgeClass,
            )}
          >
            <CalendarDays className="size-3.5 shrink-0 @[18rem]:size-4" aria-hidden />
            Бесплатная отмена
          </span>
        )}
        {isRated(hotel) && (
          <span
            className={cn(
              'ml-auto flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold @[18rem]:size-9 @[18rem]:text-sm',
              badgeClass,
            )}
          >
            <span className="sr-only">Оценка гостей </span>
            {formatDecimal(hotel.rating)}
          </span>
        )}
        <FavoriteButton
          hotelId={hotel.id}
          className={cn(
            'pointer-events-auto ml-auto size-8 border-0 text-success-foreground shadow-none hover:bg-success-soft @[18rem]:size-9 [&_svg]:size-4.5',
            badgeClass,
          )}
        />
      </div>
      {hasStars(hotel) && (
        <span
          role="img"
          aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          className="pointer-events-none absolute right-2 bottom-2 flex gap-0.5 rounded-full bg-black/45 px-2 py-1 text-(--decor-star) backdrop-blur-sm"
        >
          {Array.from({ length: hotel.stars }, (_, i) => (
            <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
          ))}
        </span>
      )}
    </>
  )
}
