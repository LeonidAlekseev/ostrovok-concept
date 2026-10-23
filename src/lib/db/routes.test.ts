import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '../../data/routes'

const db = vi.hoisted(() => ({
  row: null as { data: unknown } | null,
  rows: [] as { featured: boolean; data: unknown }[],
  error: null as { message: string } | null,
  id: '',
}))
vi.mock('./catalog', () => import('@/test/catalog'))
vi.mock('next/cache', () => ({ unstable_cache: <T>(fn: T) => fn }))
vi.mock('../supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://db.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        order: async (column: string) => {
          expect(table).toBe('routes')
          expect(column).toBe('id')
          return { data: db.error ? null : db.rows, error: db.error }
        },
        eq: (_: string, id: string) => ({
          maybeSingle: async () => {
            expect(table).toBe('routes')
            db.id = id
            return { data: db.row, error: db.error }
          },
        }),
      }),
    }),
  }),
}))

const { loadRoute, loadRouteCards } = await import('./routes')
const { previewPlan } = await import('../routes')
const { getHotel } = await import('../catalogGenerator')
const route = seedRoutes[0]

beforeEach(() => {
  db.row = null
  db.rows = []
  db.error = null
})

// routes, Requirement: Модель маршрута
describe('loadRoute', () => {
  it('reads the route by id with the hotels of its stops', async () => {
    db.row = { data: structuredClone(route) }
    const loaded = await loadRoute(route.id)
    expect(db.id).toBe(route.id)
    expect(loaded?.route).toEqual(route)
    expect(Object.values(loaded!.hotels).map((hotel) => hotel.id)).toEqual(route.stops.map((stop) => stop.hotelId))
  })

  it('gives null for an unknown id', async () => {
    expect(await loadRoute('unknown')).toBeNull()
  })

  it('rejects a route with a hotel that is not in the catalog', async () => {
    db.row = { data: { ...route, stops: [{ hotelId: 'prague-nowhere', nights: 3 }, route.stops[1]] } }
    await expect(loadRoute(route.id)).rejects.toThrow('отеля prague-nowhere нет в каталоге')
  })

  it('reports a database error', async () => {
    db.error = { message: 'timeout' }
    await expect(loadRoute(route.id)).rejects.toThrow('routes: timeout')
  })
})

// home-page, Requirement: Карточка маршрута; Витрина маршрутов
describe('loadRouteCards', () => {
  it('gives a card a route, the featured first, with the estimate of the route page', async () => {
    db.rows = seedRoutes.map((r) => ({ featured: r.id === 'tokyo-culture', data: structuredClone(r) }))
    const cards = await loadRouteCards()
    expect(cards).toHaveLength(seedRoutes.length)
    expect(cards[0].id).toBe('tokyo-culture')
    expect(cards.slice(1).map((card) => card.id)).toEqual(
      seedRoutes.filter((r) => r.id !== 'tokyo-culture').map((r) => r.id),
    )
    const hotels = Object.fromEntries(route.stops.map((stop) => [stop.hotelId, getHotel(stop.hotelId)!]))
    const plan = previewPlan(route, hotels)
    expect(cards.find((card) => card.id === route.id)).toEqual({
      id: route.id,
      persona: route.persona,
      destinationId: route.destinationId,
      title: route.title,
      author: 'Редакция О!Погнали',
      nights: plan.nights,
      price: plan.main,
      cover: route.cover,
      featured: false,
    })
  })

  it('leaves out a malformed route and one with an unknown hotel', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.rows = [
      { featured: false, data: { ...route, title: '' } },
      { featured: false, data: { ...route, stops: [{ hotelId: 'prague-nowhere', nights: 3 }, route.stops[1]] } },
      { featured: false, data: seedRoutes[1] },
    ]
    expect((await loadRouteCards()).map((card) => card.id)).toEqual([seedRoutes[1].id])
  })

  it('gives no cards without routes and reports a database error', async () => {
    expect(await loadRouteCards()).toEqual([])
    db.error = { message: 'timeout' }
    await expect(loadRouteCards()).rejects.toThrow('routes: timeout')
  })
})
