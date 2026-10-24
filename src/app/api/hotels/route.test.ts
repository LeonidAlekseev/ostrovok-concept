import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadHotels } from '@/lib/db/catalog'
import { setProduction } from '@/test/env'
import { GET } from './route'

vi.mock('@/lib/db/catalog', async () => {
  const fixture = await import('@/test/catalog')
  return { ...fixture, loadHotels: vi.fn(fixture.loadHotels) }
})
vi.mock('@/lib/env', () => import('@/test/env'))
afterEach(() => setProduction(false))

const get = (query: string) => GET(new Request(`http://localhost/api/hotels?${query}`))
const idsOf = async (response: Response) =>
  ((await response.json()) as { hotels: { id: string }[] }).hotels.map((h) => h.id)

// hotel-catalog, Requirement: Чтение каталога из Supabase
describe('GET /api/hotels', () => {
  it('returns the two favourites by id, in their order (Scenario: Избранное)', async () => {
    const response = await get('ids=prague-vltava-loft-rooms,prague-old-town-lantern')
    expect(response.status).toBe(200)
    expect(await idsOf(response)).toEqual(['prague-vltava-loft-rooms', 'prague-old-town-lantern'])
    expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/)
  })

  it('skips an unknown id', async () => {
    expect(await idsOf(await get('ids=nowhere-hotel,prague-old-town-lantern'))).toEqual(['prague-old-town-lantern'])
  })

  it('returns the full hotels of the cities, city by city', async () => {
    const ids = await idsOf(await get('destinations=prague,rome'))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => id.startsWith('prague-') || id.startsWith('rome-'))).toBe(true)
    expect(ids.findIndex((id) => id.startsWith('rome-'))).toBeGreaterThan(
      ids.findLastIndex((id) => id.startsWith('prague-')),
    )
  })

  it.each([
    ['nothing', ''],
    ['both lists', 'ids=a&destinations=prague'],
    ['an id with other characters', 'ids=../etc'],
    ['too many ids', `ids=${Array.from({ length: 61 }, (_, i) => `h${i}`).join(',')}`],
  ])('rejects %s', async (_, query) => {
    expect((await get(query)).status).toBe(400)
  })

  it('answers 503 when the catalogue is unavailable', async () => {
    vi.mocked(loadHotels).mockRejectedValueOnce(new Error('connection refused'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await get('ids=prague-old-town-lantern')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Каталог временно недоступен' })
  })
})

// hotel-catalog, Requirement: Синтетические отели только вне production
describe('GET /api/hotels in production', () => {
  it('returns no synthetic hotel by id or by city (Scenario: API)', async () => {
    setProduction(true)
    const byIds = await get('ids=prague-old-town-lantern')
    expect(byIds.status).toBe(200)
    expect(await idsOf(byIds)).toEqual([])
    expect(await idsOf(await get('destinations=prague'))).toEqual([])
  })
})
