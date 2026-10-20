'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { getDestination, type Hotel } from '../../lib/catalog'
import { formatPrice, formatDecimal } from '../../lib/format'
import { homeCollections } from '../../lib/collections'
import { DEFAULT_GUESTS, setStayParams, withStartDates, type Stay } from '../../lib/search'
import { useToday } from '../../hooks/useToday'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'

/** Hotel card of a collection. Without a date, the link has no stay and the hotel page asks for one. */
function HotelTile({ hotel, stay }: { hotel: Hotel; stay: Stay | null }) {
  const href = stay ? `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}` : `/hotels/${hotel.id}`
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-(--shadow-card)">
      <PhotoPlaceholder photo={hotel.photos[0]} className="aspect-[4/3] w-full" />
      <FavoriteButton hotelId={hotel.id} className="absolute top-2.5 right-2.5 z-10" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h4 className="text-[15px]/[1.3] font-[650]">
          {/* The link covers the card; the favourite button sits above it. */}
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary"
          >
            {hotel.name}
          </Link>
        </h4>
        <p className="text-sm/[normal] text-muted-foreground">{getDestination(hotel.destinationId)!.name}</p>
        <p className="mt-auto flex items-center justify-between gap-2">
          <Badge className="bg-primary text-primary-foreground">{formatDecimal(hotel.rating)}</Badge>
          <span className="text-right text-sm/[normal]">
            <span className="font-bold">от {formatPrice(hotel.priceFrom)}</span>
            <span className="block text-muted-foreground">за ночь</span>
          </span>
        </p>
      </div>
    </article>
  )
}

/** Four collections of hotels; a row of cards on desktop, a snapping scroll row on mobile. */
export function HomeCollections() {
  const today = useToday()
  // Starts are tomorrow and the day after, as in the search form; empty until the date is known.
  const stay = useMemo<Stay | null>(() => {
    if (!today) return null
    const { checkIn, checkOut, guests } = withStartDates(
      { destination: '', checkIn: '', checkOut: '', guests: DEFAULT_GUESTS },
      today,
    )
    return { checkIn, checkOut, guests }
  }, [today])

  return (
    <section id="collections" aria-labelledby="collections-title">
      <h2
        id="collections-title"
        className="mt-[clamp(8px,2vw,16px)] mb-[clamp(10px,2.6vw,18px)] text-title font-bold tracking-[-0.02em]"
      >
        Подборки
      </h2>
      <div className="flex flex-col gap-[clamp(18px,4vw,32px)]">
        {homeCollections.map(({ collection, hotels }) => (
          <div key={collection.id}>
            <h3 className="text-[clamp(16px,4.2vw,22px)] font-semibold tracking-[-0.01em]">{collection.title}</h3>
            <p className="mb-3 text-[clamp(13px,3.4vw,16px)] text-muted-foreground">{collection.description}</p>
            <ul
              className={cn(
                '-mx-(--page-x) flex snap-x snap-mandatory list-none gap-3 overflow-x-auto scroll-px-(--page-x) px-(--page-x) pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                'lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0',
              )}
            >
              {hotels.map((hotel) => (
                <li key={hotel.id} className="w-[min(70vw,15rem)] shrink-0 snap-start lg:w-auto">
                  <HotelTile hotel={hotel} stay={stay} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
