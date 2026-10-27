'use client'

import { useMemo } from 'react'
import { FEATURED_DESTINATION_ID } from '@/data/destinations'
import type { SpotlightHotel } from '../lib/catalog'
import { useDestinations } from './Catalog/useDestinations'
import { DrawSearch } from './DrawSearch/DrawSearch'
import { Hero } from './Hero/Hero'
import { PersonaCarousel, type PersonaSelection } from './PersonaCarousel/PersonaCarousel'
import { SearchPanel } from './SearchPanel/SearchPanel'
import { StarSearch } from './StarSearch/StarSearch'
import { TravelBanner } from './TravelBanner/TravelBanner'
import { VibeSearch } from './VibeSearch/VibeSearch'

interface Props {
  /** The "recently added" hotels: the globe's cards. */
  newHotels: readonly SpotlightHotel[]
  /** The hotels of each persona's tab. */
  selections: readonly PersonaSelection[]
}

export function HomePage({ newHotels, selections }: Props) {
  const destinations = useDestinations()
  // The globe shows the cities with new hotels; the featured city leads when it has one.
  const { cities, featured } = useMemo(() => {
    const cities = destinations.filter((d) => newHotels.some((hotel) => hotel.destinationId === d.id))
    const featured =
      cities.find((d) => d.id === FEATURED_DESTINATION_ID) ??
      cities[0] ??
      destinations.find((d) => d.id === FEATURED_DESTINATION_ID)!
    return { cities, featured }
  }, [destinations, newHotels])

  // The hero starts under the transparent header of the layout, hence the negative top margin.
  return (
    <main className="-mt-(--header-height) bg-background pb-[clamp(24px,6vw,56px)]">
      <Hero cities={cities} hotels={newHotels} featured={featured} />

      <div className="mx-auto flex max-w-(--page-max) flex-col gap-[clamp(10px,3vw,24px)] px-(--page-x)">
        <section
          id="search"
          className="relative z-10 -mt-[25vw] scroll-mt-4 md:-mt-36 lg:-mt-[calc(var(--spacing)*31.5)]"
          aria-label="Поиск отелей"
        >
          <SearchPanel />
        </section>

        <PersonaCarousel selections={selections} />

        <DrawSearch />

        <VibeSearch />

        <StarSearch />

        <TravelBanner />
      </div>
    </main>
  )
}
