import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from 'cn'
import { Separator } from '@/components/ui/separator'
import { hasFreeCancellation, TILE_PHOTOS, type TileHotel } from '../../lib/catalog'
import { formatPrice, kmFromCentre } from '../../lib/format'
import { guruPrice } from '../../lib/offer'
import { useDestination } from '../Catalog/useDestinations'
import { GeneratedBadge } from '../GeneratedBadge/GeneratedBadge'
import { GuruLogo } from '../GuruLogo/GuruLogo'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { PhotoCarousel } from '../PhotoCarousel/PhotoCarousel'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { PhotoStars } from './PhotoStars'
import { TileBadges } from './TileBadges'

/** A tile's slot in a horizontal strip: a phone-sized card, 440 px from `md` up (the home strips lay it out on a grid). */
export const HOTEL_TILE_SLOT = 'w-[min(78vw,20rem)] flex-none snap-start md:w-110'

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
  /** A line under the badges: «Сведения отельера» of the search results. */
  note?: ReactNode
}

/**
 * The hotel card of the vibe, the stars, favourites and search results: the photo carousel with the counter,
 * the arrows and the stars, then the name with the favourite toggle, the guest rating and the free cancellation,
 * the distance to the city centre and the regular and GURU prices. The kind of stay is shown on the hotel's page
 * only. The plain card has the first photo alone and no badges or toggle. Both have the «generated» mark of a
 * made-up hotel on the photo.
 */
export function HotelTile({
  hotel,
  href,
  price = hotel.priceFrom,
  freeCancellation = hasFreeCancellation(hotel),
  heading: Heading = 'h3',
  plain = false,
  note,
  className,
  ...props
}: Props) {
  const destination = useDestination(hotel.destinationId)
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
          <PhotoStars hotel={hotel} className="absolute right-2 bottom-2" />
          <GeneratedBadge hotel={hotel} className="absolute bottom-3 left-1/2 -translate-x-1/2" />
        </PhotoCarousel>
      )}

      <div className="flex flex-1 flex-col gap-1 px-2 pt-3 pb-1">
        <div className="flex items-start gap-2">
          <Heading className="min-w-0 flex-1 text-[17px]/[1.25] font-bold">
            {/* The link covers the card; the photos and the favourite button sit above it. */}
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary"
            >
              {hotel.name}
            </Link>
          </Heading>
          {!plain && (
            <FavoriteButton
              hotelId={hotel.id}
              className="relative z-10 -mt-1.5 -mr-1.5 size-9 shrink-0 border-0 shadow-none [&_svg]:size-5"
            />
          )}
        </div>
        {!plain && <TileBadges hotel={hotel} freeCancellation={freeCancellation} />}
        {note}
        <p className="flex items-center gap-1 text-sm/[normal] text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {/* From 281px the city follows the distance; the screen reader always gets the whole text. */}
          <span className="min-w-0 truncate">
            <span aria-hidden>
              {kmFromCentre(hotel.distanceKm)}
              <span className="hidden @[281px]:inline"> {destination?.genitive}</span>
            </span>
            <span className="sr-only">
              {kmFromCentre(hotel.distanceKm)} {destination?.genitive}
            </span>
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
        </div>
      </div>
    </article>
  )
}
