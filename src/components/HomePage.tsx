'use client'

import { useMemo } from 'react'
import { FEATURED_DESTINATION_ID } from '@/data/destinations'
import { useHotelSearch } from '../hooks/useHotelSearch'
import type { HotelSummary } from '../lib/catalog'
import type { RouteCardData } from '../lib/routes'
import { useDestinations } from './Catalog/useDestinations'
import { Hero } from './Hero/Hero'
import { PersonaCarousel } from './PersonaCarousel/PersonaCarousel'
import { RouteShowcase } from './RouteCard/RouteShowcase'
import { SearchPanel } from './SearchPanel/SearchPanel'
import { StarSearch } from './StarSearch/StarSearch'
import { TravelBanner } from './TravelBanner/TravelBanner'
import { VibeSearch } from './VibeSearch/VibeSearch'

interface Props {
  /** The "recently added" hotels: the assistant's suggestions. */
  newHotels: readonly HotelSummary[]
  /** The cards of all routes, the featured first. */
  routes: readonly RouteCardData[]
}

export function HomePage({ newHotels, routes }: Props) {
  const destinations = useDestinations()
  // The globe shows the cities with routes; the featured city leads when it has one.
  const { cities, featured } = useMemo(() => {
    const cities = destinations.filter((d) => routes.some((route) => route.destinationId === d.id))
    const featured =
      cities.find((d) => d.id === FEATURED_DESTINATION_ID) ??
      cities[0] ??
      destinations.find((d) => d.id === FEATURED_DESTINATION_ID)!
    return { cities, featured }
  }, [destinations, routes])
  // The assistant's choice opens the results page, whose manual form shows it.
  const { searchFor } = useHotelSearch()

  // The hero starts under the transparent header of the layout, hence the negative top margin.
  return (
    <main className="-mt-(--header-height) bg-background pb-[clamp(24px,6vw,56px)]">
      <Hero cities={cities} routes={routes} featured={featured} />

      <div className="mx-auto flex max-w-(--page-max) flex-col gap-[clamp(10px,3vw,24px)] px-(--page-x)">
        <section
          id="search"
          className="relative z-10 -mt-[clamp(120px,31vw,150px)] scroll-mt-4 md:-mt-24 lg:-mt-21"
          aria-label="Поиск отелей"
        >
          <SearchPanel onChoose={searchFor} newHotels={newHotels} routes={routes} />
        </section>

        <PersonaCarousel routes={routes} />

        <RouteShowcase routes={routes} />

        <VibeSearch routes={routes} />

        <StarSearch routes={routes} />

        <TravelBanner />
      </div>
    </main>
  )
}
