import { Star } from 'lucide-react'
import { cn } from 'cn'
import { hasStars, type TileHotel } from '../../lib/catalog'
import { countRu } from '../../lib/format'

/** The stars of the hotel on a dark pill laid over its photo; none for apartments and villas. */
export function PhotoStars({ hotel, className }: { hotel: TileHotel; className?: string }) {
  if (!hasStars(hotel)) return null
  return (
    <span
      role="img"
      aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
      className={cn(
        'pointer-events-none flex gap-0.5 rounded-full bg-black/45 px-2 py-1 text-(--decor-star) backdrop-blur-sm',
        className,
      )}
    >
      {Array.from({ length: hotel.stars }, (_, i) => (
        <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
      ))}
    </span>
  )
}
