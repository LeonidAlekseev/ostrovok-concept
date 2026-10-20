import Link from 'next/link'
import type { ComponentProps } from 'react'
import { CalendarDays, MapPin, Star } from 'lucide-react'
import { cn } from 'cn'
import { Separator } from '@/components/ui/separator'
import { getDestination, hasFreeCancellation, type Hotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { guruPrice } from '../../lib/offer'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { GuruLogo } from '../GuruLogo/GuruLogo'
import { PhotoCarousel } from '../PhotoCarousel/PhotoCarousel'

interface Props extends Omit<ComponentProps<'article'>, 'children'> {
  hotel: Hotel
  href: string
  /** The regular price; the hotel's lowest price per night by default. */
  price?: number
  /** The "Бесплатная отмена" badge; by default, when any rate of the hotel has it. */
  freeCancellation?: boolean
  /** Heading level of the name, below the heading of the list. */
  heading?: 'h2' | 'h3' | 'h4'
}

// The light green of the system behind the badges on the photo.
const badgeClass = 'bg-success-soft/90 text-success-foreground backdrop-blur-sm'

/**
 * The hotel card of collections, favourites and search results: the photo carousel with the free
 * cancellation, the guest rating, the favourite toggle and the stars on it, then the name, the
 * distance to the city centre and the regular and GURU prices.
 */
export function HotelTile({
  hotel,
  href,
  price = hotel.priceFrom,
  freeCancellation = hasFreeCancellation(hotel),
  heading: Heading = 'h3',
  className,
  ...props
}: Props) {
  return (
    <article
      {...props}
      className={cn(
        '@container relative flex h-full flex-col overflow-hidden rounded-2xl bg-card p-2 shadow-(--shadow-card)',
        className,
      )}
    >
      {/* Above the card link: the photos swipe and lead to the hotel themselves. */}
      <PhotoCarousel photos={hotel.photos} href={href} className="@container z-10 aspect-[4/3] w-full rounded-xl">
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
          <span
            className={cn(
              'ml-auto flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold @[18rem]:size-9 @[18rem]:text-sm',
              badgeClass,
            )}
          >
            <span className="sr-only">Оценка гостей </span>
            {formatDecimal(hotel.rating)}
          </span>
          <FavoriteButton
            hotelId={hotel.id}
            className={cn(
              'pointer-events-auto size-8 border-0 text-success-foreground shadow-none hover:bg-success-soft @[18rem]:size-9 [&_svg]:size-4.5',
              badgeClass,
            )}
          />
        </div>
        <span
          role="img"
          aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          className="pointer-events-none absolute right-2 bottom-2 flex gap-0.5 rounded-full bg-black/45 px-2 py-1 text-(--decor-star) backdrop-blur-sm"
        >
          {Array.from({ length: hotel.stars }, (_, i) => (
            <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
          ))}
        </span>
      </PhotoCarousel>

      <div className="flex flex-1 flex-col gap-1 px-2 pt-3 pb-1">
        <Heading className="text-[17px]/[1.25] font-bold">
          {/* The link covers the card; the photos and the favourite button sit above it. */}
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary"
          >
            {hotel.name}
          </Link>
        </Heading>
        <p className="flex items-center gap-1 text-sm/[normal] text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {formatDecimal(hotel.distanceKm)} км от центра {getDestination(hotel.destinationId)?.genitive}
        </p>
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Separator />
          {/* One row from 16rem inside the card's padding; a narrower card stacks the GURU price under the regular one. */}
          <div className="flex flex-col items-start gap-0.5 text-lg/7 font-bold whitespace-nowrap @[16rem]:flex-row @[16rem]:items-center @[16rem]:gap-2.5 @[16rem]:text-base/7 @[20rem]:text-lg/7 @[26rem]:text-xl/7">
            <p>{formatPrice(price)}</p>
            <Separator orientation="vertical" className="my-1 hidden @[16rem]:block" />
            <p className="flex items-center gap-2 text-primary">
              <span>
                <span className="sr-only">Цена GURU </span>
                {formatPrice(guruPrice(price))}
              </span>
              <GuruLogo className="text-base" />
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
