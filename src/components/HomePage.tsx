'use client'

import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FEATURED_DESTINATION_ID, scenarios, type Destination } from '@/data/destinations'
import { useHotelSearch } from '../hooks/useHotelSearch'
import { loadDestinations, loadNewHotels } from '../lib/catalogSource'
import { formatPrice } from '../lib/format'
import { resolveTarget } from '../lib/search'
import { DestinationCard } from './DestinationCard/DestinationCard'
import { HomeCollections } from './HomeCollections/HomeCollections'
import { Hero } from './Hero/Hero'
import { SearchPanel, type SearchMode } from './SearchPanel/SearchPanel'
import { StarSearch } from './StarSearch/StarSearch'
import { TravelBanner } from './TravelBanner/TravelBanner'
import { VibeSearch } from './VibeSearch/VibeSearch'

const destinations = loadDestinations()
const featured = destinations.find((d) => d.id === FEATURED_DESTINATION_ID)!
const globeDestinations = destinations.filter((d) => d.onGlobe)
const scenarioPrices = new Map(
  scenarios.map((s) => [
    s.id,
    formatPrice(Math.min(...destinations.filter((d) => d.scenarios.includes(s.id)).map((d) => d.priceFrom))),
  ]),
)

export function HomePage() {
  const search = useHotelSearch()
  const destinationRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<SearchMode>('assistant')
  const { setDestination, searchFor } = search

  /** Shows the manual form right away, so its fields can take focus in the same handler. */
  const openManual = useCallback(() => flushSync(() => setMode('manual')), [])

  /** Put a destination or scenario into the search and move focus to the submit button. */
  const applyToSearch = useCallback(
    (text: string) => {
      openManual()
      setDestination(text)
      submitRef.current?.focus({ preventScroll: true })
      submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [openManual, setDestination],
  )

  const startSearch = useCallback(() => {
    openManual()
    destinationRef.current?.focus()
  }, [openManual])

  const chooseFromAssistant = useCallback(
    (query: Parameters<typeof searchFor>[0]) => {
      const found = searchFor(query)
      // A valid choice opens the results page; otherwise the manual form shows what to fix.
      if (Object.keys(found).length > 0) {
        openManual()
        document.getElementById('search')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return found
    },
    [openManual, searchFor],
  )

  const target = resolveTarget(search.query.destination, destinations)
  const selectedDestinationId = target?.kind === 'destination' ? target.destination.id : null
  const selectedScenarioId = target?.kind === 'scenario' ? target.scenario : null

  // The hero starts under the transparent header of the layout, hence the negative top margin.
  return (
    <main className="-mt-(--header-height) bg-background pb-[clamp(24px,6vw,56px)]">
      <Hero
        markers={globeDestinations}
        hotels={loadNewHotels()}
        featured={featured}
        selectedId={selectedDestinationId}
        onSelect={(d: Destination) => applyToSearch(d.name)}
      />

      <div className="mx-auto flex max-w-(--page-max) flex-col gap-[clamp(10px,3vw,24px)] px-(--page-x)">
        <section
          id="search"
          className="relative z-10 -mt-[clamp(120px,31vw,150px)] scroll-mt-4 md:-mt-24 lg:-mt-21"
          aria-label="Поиск отелей"
        >
          <SearchPanel
            mode={mode}
            onModeChange={setMode}
            search={search}
            destinationRef={destinationRef}
            submitRef={submitRef}
            onPreview={(d) => setDestination(d.name)}
            onChoose={chooseFromAssistant}
          />
        </section>

        <section id="ideas" aria-labelledby="ideas-title">
          <div className="mt-[clamp(8px,2vw,16px)] mb-[clamp(10px,2.6vw,18px)] flex items-baseline justify-between gap-3">
            <h2 id="ideas-title" className="text-title font-bold tracking-[-0.02em]">
              Популярные направления
            </h2>
            <Button
              variant="link"
              className={`flex-none gap-1 py-1 text-[clamp(13px,3.6vw,18px)] font-medium hover:[&_svg]:translate-x-0.5 [&_svg]:transition-transform`}
              onClick={startSearch}
            >
              Смотреть все
              <ArrowRight className="size-4.5" aria-hidden />
            </Button>
          </div>
          {/* overflow-x: auto clips vertically too, so the padding leaves room for the hover shadow and the
                selection ring (about 20px above, 44px below); negative margins keep the layout unchanged. */}
          <ul className="-mx-(--page-x) -mt-3.5 -mb-9.5 grid snap-x snap-mandatory list-none scroll-px-(--page-x) grid-cols-[repeat(3,minmax(100px,1fr))] gap-[clamp(8px,2.2vw,20px)] overflow-x-auto px-(--page-x) pt-5 pb-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <DestinationCard
                  title={scenario.title}
                  image={scenario.image}
                  alt={scenario.alt}
                  price={scenarioPrices.get(scenario.id)!}
                  selected={selectedScenarioId === scenario.id}
                  onSelect={() => applyToSearch(scenario.title)}
                />
              </li>
            ))}
          </ul>
        </section>

        <VibeSearch />

        <StarSearch />

        <HomeCollections />

        <TravelBanner />
      </div>
    </main>
  )
}
