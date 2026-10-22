import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '../../data/routes'

const db = vi.hoisted(() => ({
  row: null as { data: unknown } | null,
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

const { loadRoute } = await import('./routes')
const route = seedRoutes[0]

beforeEach(() => {
  db.row = null
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
