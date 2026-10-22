import { destinations } from '@/data/destinations'
import type { Hotel } from '@/lib/catalog'
import { buildCatalog, fullHotelsIn, getHotel, hotels, newHotels } from '@/lib/catalogGenerator'

/**
 * The tests' catalogue: the generator stands in for Supabase, so no test goes to the network. The loaders
 * mirror src/lib/db/catalog.ts (`vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))`), and
 * `catalogFetch` answers `GET /api/hotels` in the browser tests (src/test/setup.ts).
 */

export const CATALOG_TAG = 'catalog'
export const CATALOG_LIFETIME = 3600

export class CatalogUnavailableError extends Error {}

export const loadDestinations = async () => destinations
export const loadDestination = async (id: string) => destinations.find((d) => d.id === id)
export const loadHotelSummaries = async () => hotels
export const loadNewHotels = async () => newHotels
export const loadHotel = async (id: string) => getHotel(id)
export const loadHotels = async (ids: readonly string[]) => ids.flatMap((id) => getHotel(id) ?? [])
export const loadCityHotels = async (destinationIds: readonly string[]) => destinationIds.flatMap(fullHotelsIn)
export const loadAllHotels = async () => hotels.map((h) => getHotel(h.id)!)

/** The whole catalogue, built once for the tests that need every full hotel. */
let all: Hotel[] | undefined
export const allHotels = () => (all ??= buildCatalog())

const listOf = (value: string | null) => value?.split(',').filter(Boolean) ?? []

/** `fetch` of the browser tests: `/api/hotels` from the generator, anything else is a test's mistake. */
export async function catalogFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
  if (url.pathname !== '/api/hotels') throw new Error(`Unexpected fetch in a test: ${url}`)
  const found = url.searchParams.has('ids')
    ? await loadHotels(listOf(url.searchParams.get('ids')))
    : await loadCityHotels(listOf(url.searchParams.get('destinations')))
  return Response.json({ hotels: found })
}
