import Link from 'next/link'
import type { ComponentProps } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from 'cn'
import { Separator } from '@/components/ui/separator'
import { hasFreeCancellation, STAY_TYPES, TILE_PHOTOS, type TileHotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice, guestsLabel } from '../../lib/format'
import { guruPrice } from '../../lib/offer'
import type { Guests } from '../../lib/search'
import { useDestination } from '../Catalog/useDestinations'
import { GeneratedBadge } from '../GeneratedBadge/GeneratedBadge'
import { GuruLogo } from '../GuruLogo/GuruLogo'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { PhotoCarousel } from '../PhotoCarousel/PhotoCarousel'
import { PhotoBadges } from './PhotoBadges'

interface Props extends Omit<ComponentProps<'article'>, 'children'> {
  hotel: TileHotel
  href: string
  /** The regular price; the hotel's lowest price per night by default. */
  price?: number
  /** The "Бесплатная отмена" badge; by default, when any rate of the hotel has it. */
  freeCancellation?: boolean
  /** Heading level of the name, below the heading of the list. */
  heading?: 'h2' | 'h3' | 'h4'
  /** The simple card of the persona selections: one photo, without badges, arrows and the kind of stay. */
  plain?: boolean
  /** The price for a whole stay instead of the regular one, with «за 5 ночей · 2 гостя» under it. */
  stay?: Stay
}

/** The price of a stay: the total for its nights and guests. */
export interface Stay {
  total: number
  nights: number
  guests: Guests
}

/**
 * The hotel card of the vibe, the stars, favourites and search results: the photo carousel with the free
 * cancellation, the guest rating, the favourite toggle and the stars on it, then the name, the
 * kind of stay if it is not a hotel with the distance to the city centre and the regular and GURU prices — or
 * those for a stay, with its nights and guests.
 * The plain card has the first photo alone and no badges, and no kind of stay. A made-up hotel has the
 * «generated» mark on the photo in both.
 */
export function HotelTile({
  hotel,
  href,
  price: regular = hotel.priceFrom,
  freeCancellation = hasFreeCancellation(hotel),
  heading: Heading = 'h3',
  plain = false,
  stay,
  className,
  ...props
}: Props) {
  const destination = useDestination(hotel.destinationId)
  const price = stay?.total ?? regular
  return (
    <article
      {...props}
      className={cn(
        '@container relative flex h-full flex-col overflow-hidden rounded-2xl bg-card p-2 shadow-(--shadow-card)',
        className,
      )}
    >
      {/* Above the card link: the photos swipe and lead to the hotel themselves. The first five
          only: the rest are for the hotel page. */}
      {plain ? (
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="relative z-10 block aspect-[4/3] w-full overflow-hidden rounded-xl"
        >
          <PhotoPlaceholder photo={hotel.photos[0]} className="size-full" />
          <GeneratedBadge hotel={hotel} className="absolute bottom-3 left-1/2 -translate-x-1/2" />
        </Link>
      ) : (
        <PhotoCarousel
          photos={hotel.photos.slice(0, TILE_PHOTOS)}
          href={href}
          className="@container z-10 aspect-[4/3] w-full rounded-xl"
        >
          <PhotoBadges hotel={hotel} freeCancellation={freeCancellation} />
          <GeneratedBadge hotel={hotel} className="absolute bottom-3 left-1/2 -translate-x-1/2" />
        </PhotoCarousel>
      )}

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
          {!plain && hotel.stayType !== 'hotel' && (
            <>
              {/* The kind of stay gives way first on a narrow card: «Апарт…», the distance stays on one line. */}
              <span className="min-w-[4.5em] shrink-[20] truncate font-semibold text-foreground">
                {STAY_TYPES[hotel.stayType]}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="min-w-0 truncate">
            {formatDecimal(hotel.distanceKm)} км от центра {destination?.genitive}
          </span>
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
          {stay && (
            <p className="-mt-1.5 text-xs/[normal] text-muted-foreground">
              за {countRu(stay.nights, ['ночь', 'ночи', 'ночей'])} · {guestsLabel(stay.guests)}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
