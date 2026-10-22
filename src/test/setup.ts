import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { clearHotelRequests } from '@/hooks/useHotels'
import type { ReadingInput } from '@/lib/horoscope'
import { sessionStore } from '@/lib/session'
import type { Answer } from '@/lib/vibe'
import { catalogFetch } from './catalog'

// Testing Library unmounts on its own only when the runner exposes globals; this config does not.
afterEach(cleanup)
// The session lives in memory (Supabase's cookies in the app): no test inherits another's.
afterEach(() => sessionStore.set(null))

// jsdom cannot navigate and logs "Not implemented: navigation" for every link click. Cancel it after
// the components' own handlers have run (bubbling), so the tests still see the href and the clicks.
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault()
})

// jsdom has no layout and no element scrolling: scrollTo is a no-op, as for a strip without width.
Element.prototype.scrollTo ??= () => {}

// The catalogue comes from the generator (src/test/catalog.ts): the destinations of the root layout, the
// server actions and `GET /api/hotels`.
vi.mock('@/components/Catalog/useDestinations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Catalog/useDestinations')>()
  const { destinations } = await import('@/data/destinations')
  return {
    ...actual,
    useDestinations: () => destinations,
    useDestination: (id: string) => destinations.find((d) => d.id === id),
  }
})
vi.mock('@/components/VibeSearch/actions', async () => {
  const { vibeHotels } = await import('@/lib/vibe')
  const { destinations } = await import('@/data/destinations')
  const { allHotels } = await import('./catalog')
  return { vibeHotelsAction: async (answers: Answer[]) => vibeHotels(answers, allHotels(), destinations) }
})
vi.mock('@/components/StarSearch/actions', async () => {
  const { readStars } = await import('@/lib/horoscope')
  const { destinations } = await import('@/data/destinations')
  const { allHotels } = await import('./catalog')
  return { readStarsAction: async (input: ReadingInput) => readStars(input, destinations, allHotels()) }
})
beforeEach(() => {
  clearHotelRequests()
  vi.stubGlobal('fetch', vi.fn(catalogFetch))
})
afterEach(() => {
  vi.unstubAllGlobals()
})
