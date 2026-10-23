'use client'

import { useMemo } from 'react'
import { FEATURED_DESTINATION_ID } from '@/data/destinations'
import { useHotelSearch } from '../hooks/useHotelSearch'
import type { HotelSummary } from '../lib/catalog'
import { useDestinations } from './Catalog/useDestinations'
import { DrawSearch } from './DrawSearch/DrawSearch'
import { Hero } from './Hero/Hero'
import { PersonaCarousel, type PersonaSelection } from './PersonaCarousel/PersonaCarousel'
import { SearchPanel } from './SearchPanel/SearchPanel'
import { StarSearch } from './StarSearch/StarSearch'
import { TravelBanner } from './TravelBanner/TravelBanner'
import { VibeSearch } from './VibeSearch/VibeSearch'

interface Props {
  /** The "recently added" hotels: the globe's cards and the assistant's suggestions. */
  newHotels: readonly HotelSummary[]
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
  // The assistant's choice opens the results page, whose manual form shows it.
  const { searchFor } = useHotelSearch()

  // The hero starts under the transparent header of the layout, hence the negative top margin.
  return (
    <main className="-mt-(--header-height) bg-background pb-[clamp(24px,6vw,56px)]">
      <Hero cities={cities} hotels={newHotels} featured={featured} />

      <div className="mx-auto flex max-w-(--page-max) flex-col gap-[clamp(10px,3vw,24px)] px-(--page-x)">
        <section
          id="search"
          className="relative z-10 -mt-[clamp(120px,31vw,150px)] scroll-mt-4 md:-mt-24 lg:-mt-21"
          aria-label="Поиск отелей"
        >
          <SearchPanel onChoose={searchFor} newHotels={newHotels} />
        </section>

        <PersonaCarousel selections={selections} />

        <VibeSearch />

        <StarSearch />

        <DrawSearch />

        <TravelBanner />
      </div>
    </main>
  )
}
