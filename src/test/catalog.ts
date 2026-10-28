import { destinations } from '@/data/destinations'
import { isVisibleHotel, type Hotel } from '@/lib/catalog'
import { inBox, parseBox, type MapBox } from '@/lib/mapBox'
import { buildCatalog, fullHotelsIn, getHotel, hotels, newHotels } from '@/lib/catalogGenerator'

/**
 * The tests' catalogue: the generator stands in for Supabase, so no test goes to the network. The loaders
 * mirror src/lib/db/catalog.ts (`vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))`), and
 * `catalogFetch` answers `GET /api/hotels` in the browser tests (src/test/setup.ts). Like the loaders, they give
 * only the hotels `isVisibleHotel` shows: all of the generator's outside production (src/test/env.ts).
 */

export class CatalogUnavailableError extends Error {}

/** The generator has no hotels outside the noise maps. */
export const loadHiddenHotelIds = async (): Promise<ReadonlySet<string>> => new Set<string>()
export const loadDestinations = async () => destinations
export const loadHotelSummaries = async () => hotels.filter(isVisibleHotel)
export const loadNewHotels = async () => newHotels.filter(isVisibleHotel)
export const loadHotel = async (id: string) => (isVisibleHotel({ id }) ? getHotel(id) : undefined)
export const loadHotels = async (ids: readonly string[]) =>
  ids.filter((id) => isVisibleHotel({ id })).flatMap((id) => getHotel(id) ?? [])
export const loadCityHotels = async (destinationIds: readonly string[]) =>
  destinationIds.flatMap(fullHotelsIn).filter(isVisibleHotel)
export const loadBoxHotels = async (box: MapBox) => allHotels().filter((h) => inBox(box, h.lon, h.lat))
export const loadAllHotels = async () => (await loadHotelSummaries()).map((h) => getHotel(h.id)!)

/** The whole catalogue, built once, for the tests that need every full hotel the catalogue shows. */
let all: Hotel[] | undefined
export const allHotels = () => (all ??= buildCatalog()).filter(isVisibleHotel)

const listOf = (value: string | null) => value?.split(',').filter(Boolean) ?? []

/** `fetch` of the browser tests: `/api/hotels` from the generator, anything else is a test's mistake. */
export async function catalogFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
  if (url.pathname !== '/api/hotels') throw new Error(`Unexpected fetch in a test: ${url}`)
  const box = url.searchParams.get('bbox')
  const found = box
    ? await loadBoxHotels(parseBox(box)!)
    : url.searchParams.has('ids')
      ? await loadHotels(listOf(url.searchParams.get('ids')))
      : await loadCityHotels(listOf(url.searchParams.get('destinations')))
  return Response.json({ hotels: found })
}

/** The generator makes no hotels for real Valencia: these are the generated ones placed there, for the selections. */
export const valenciaHotels = (): Hotel[] =>
  allHotels().map((h, i) => (i % 4 === 0 ? { ...h, destinationId: 'valencia' } : h))
