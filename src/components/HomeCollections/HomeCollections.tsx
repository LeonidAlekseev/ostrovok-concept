'use client'

import { useMemo } from 'react'
import { cn } from 'cn'
import { getHomeCollections } from '../../lib/collections'
import { setStayParams, startStay } from '../../lib/search'
import { useToday } from '../../hooks/useToday'
import { HotelTile } from '../HotelTile/HotelTile'

/** Four collections of hotels; a row of cards on desktop, a snapping scroll row on mobile. */
export function HomeCollections() {
  const today = useToday()
  // Starts are tomorrow and the day after, as in the search form; empty until the date is known.
  const stay = useMemo(() => startStay(today), [today])

  return (
    <section id="collections" aria-labelledby="collections-title">
      <h2
        id="collections-title"
        className="mt-[clamp(8px,2vw,16px)] mb-[clamp(10px,2.6vw,18px)] text-title font-bold tracking-[-0.02em]"
      >
        Подборки
      </h2>
      <div className="flex flex-col gap-[clamp(18px,4vw,32px)]">
        {getHomeCollections().map(({ collection, hotels }) => (
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
                  {/* Without a date, the link has no stay and the hotel page asks for one. */}
                  <HotelTile
                    hotel={hotel}
                    heading="h4"
                    swipePhotos={false}
                    href={
                      stay ? `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}` : `/hotels/${hotel.id}`
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
