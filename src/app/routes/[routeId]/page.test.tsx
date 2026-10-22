import { describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import { getHotel } from '@/lib/catalogGenerator'
import RouteRoute, { generateMetadata } from './page'

vi.mock('@/lib/db/routes', () => ({
  loadRoute: async (id: string) => {
    const route = seedRoutes.find((r) => r.id === id)
    return route
      ? { route, hotels: Object.fromEntries(route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!])) }
      : null
  },
}))

const params = (routeId: string) => ({ params: Promise.resolve({ routeId }) })

// routes, Requirement: Страница маршрута
describe('route page', () => {
  it('renders a known route with its title', async () => {
    const element = await RouteRoute(params('prague-culture'))
    expect(element.props.route.id).toBe('prague-culture')
    expect(Object.keys(element.props.hotels)).toEqual(['prague-mala-strana-residence', 'prague-vltava-loft-rooms'])
    expect(await generateMetadata(params('prague-culture'))).toEqual({ title: 'Культурный отпуск в Праге' })
  })

  it('shows «not found» for an unknown route', async () => {
    await expect(RouteRoute(params('unknown'))).rejects.toMatchObject({ digest: expect.stringContaining('404') })
    expect(await generateMetadata(params('unknown'))).toEqual({ title: 'Страница не найдена' })
  })
})
