import Link from 'next/link'
import type { ComponentProps } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from 'cn'
import { Separator } from '@/components/ui/separator'
import { getDestination, hasFreeCancellation, type Hotel } from '../../lib/catalog'
import { formatDecimal, formatPrice } from '../../lib/format'
import { guruPrice } from '../../lib/offer'
import { GuruLogo } from '../GuruLogo/GuruLogo'
import { PhotoCarousel } from '../PhotoCarousel/PhotoCarousel'
import { PhotoBadges } from './PhotoBadges'

interface Props extends Omit<ComponentProps<'article'>, 'children'> {
  hotel: Hotel
  href: string
  /** The regular price; the hotel's lowest price per night by default. */
  price?: number
  /** The "Бесплатная отмена" badge; by default, when any rate of the hotel has it. */
  freeCancellation?: boolean
  /** Heading level of the name, below the heading of the list. */
  heading?: 'h2' | 'h3' | 'h4'
  /** Photos turn by the arrows only, so a swipe on them goes to a scrolling row around the card. */
  swipePhotos?: boolean
}

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
  swipePhotos = true,
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
      <PhotoCarousel
        photos={hotel.photos}
        href={href}
        swipe={swipePhotos}
        className="@container z-10 aspect-[4/3] w-full rounded-xl"
      >
        <PhotoBadges hotel={hotel} freeCancellation={freeCancellation} />
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
