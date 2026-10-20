import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Star } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { getDestination, type Hotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'

interface Props extends Omit<ComponentProps<'article'>, 'children'> {
  hotel: Hotel
  href: string
  /** The price "от N ₽"; the hotel's lowest price per night by default. */
  price?: number
  /** Heading level of the name, below the heading of the list. */
  heading?: 'h2' | 'h3' | 'h4'
  /** Details between the city and the bottom row. */
  children?: ReactNode
}

/**
 * The hotel card of collections, favourites and search results: the photo with the hotel's stars,
 * the name and the city, then the price, the guest rating and the favourite toggle in one row.
 */
export function HotelTile({
  hotel,
  href,
  price = hotel.priceFrom,
  heading: Heading = 'h3',
  children,
  className,
  ...props
}: Props) {
  return (
    <article
      {...props}
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-(--shadow-card)',
        className,
      )}
    >
      <div className="relative">
        <PhotoPlaceholder photo={hotel.photos[0]} className="aspect-[4/3] w-full" />
        <span
          role="img"
          aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          className="absolute right-2 bottom-2 flex gap-0.5 rounded-full bg-black/45 px-2 py-1 text-(--decor-star) backdrop-blur-sm"
        >
          {Array.from({ length: hotel.stars }, (_, i) => (
            <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
          ))}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <Heading className="text-[15px]/[1.3] font-[650]">
            {/* The link covers the card; the favourite button sits above it. */}
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary"
            >
              {hotel.name}
            </Link>
          </Heading>
          <p className="text-sm/[normal] text-muted-foreground">{getDestination(hotel.destinationId)!.name}</p>
        </div>
        {children}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <p className="mr-auto text-base/8 font-bold whitespace-nowrap">от {formatPrice(price)}</p>
          <Badge className="bg-primary text-primary-foreground">
            <span className="sr-only">Оценка гостей </span>
            {formatDecimal(hotel.rating)}
          </Badge>
          <FavoriteButton hotelId={hotel.id} className="relative z-10 size-8" />
        </div>
      </div>
    </article>
  )
}
