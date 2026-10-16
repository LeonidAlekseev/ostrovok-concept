'use client'

import { useCallback, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { destinations, FEATURED_DESTINATION_ID, scenarios, type Destination } from '../data/destinations'
import { newHotels } from '../data/hotels'
import { useHotelSearch } from '../hooks/useHotelSearch'
import { formatPrice } from '../lib/format'
import { resolveTarget } from '../lib/search'
import { DestinationCard } from './DestinationCard/DestinationCard'
import { Header } from './Header/Header'
import { Hero } from './Hero/Hero'
import { SearchForm } from './SearchForm/SearchForm'
import { TravelBanner } from './TravelBanner/TravelBanner'
import styles from './HomePage.module.css'

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
  const { setDestination } = search

  /** Put a destination or scenario into the search and move focus to the submit button. */
  const applyToSearch = useCallback(
    (text: string) => {
      setDestination(text)
      submitRef.current?.focus({ preventScroll: true })
      submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [setDestination],
  )

  const target = resolveTarget(search.query.destination)
  const selectedDestinationId = target?.kind === 'destination' ? target.destination.id : null
  const selectedScenarioId = target?.kind === 'scenario' ? target.scenario : null

  return (
    <>
      <Header onStartSearch={() => destinationRef.current?.focus()} />
      <main className={styles.main}>
        <Hero
          markers={globeDestinations}
          hotels={newHotels}
          featured={featured}
          selectedId={selectedDestinationId}
          onSelect={(d: Destination) => applyToSearch(d.name)}
        />

        <div className={styles.content}>
          <section id="search" className={styles.search} aria-label="Поиск отелей">
            <SearchForm search={search} destinationRef={destinationRef} submitRef={submitRef} />
          </section>

          <section id="ideas" aria-labelledby="ideas-title">
            <div className={styles.sectionHead}>
              <h2 id="ideas-title" className={styles.sectionTitle}>
                Популярные направления
              </h2>
              <button type="button" className={styles.seeAll} onClick={() => destinationRef.current?.focus()}>
                Смотреть все
                <ArrowRight size={18} aria-hidden />
              </button>
            </div>
            <ul className={styles.cards}>
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

          <TravelBanner />
        </div>
      </main>
    </>
  )
}
