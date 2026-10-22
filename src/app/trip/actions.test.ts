import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import { loadRoute } from '@/lib/db/routes'
import { createTrip, saveTrip } from '@/lib/db/trips'
import { similarHotels } from '@/lib/ai/semantic'
import { copyRouteToTrip, saveTripEdits, similarHotelScores } from './actions'

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect: nav.redirect, RedirectType: { replace: 'replace' } }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/db/routes', () => ({ loadRoute: vi.fn() }))
vi.mock('@/lib/ai/semantic', () => ({ similarHotels: vi.fn() }))
vi.mock('@/lib/db/trips', () => ({ createTrip: vi.fn(), deleteTrip: vi.fn(), saveTrip: vi.fn() }))

const route = seedRoutes[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(loadRoute).mockResolvedValue({ route, hotels: {} })
})

// trip-plan, Requirement: Копия маршрута
describe('copyRouteToTrip', () => {
  it('copies the route and opens the plan in place of the address (Scenario: Копирование со входом)', async () => {
    vi.mocked(createTrip).mockResolvedValue('7c0b4a52-6c1e-4f43-9d2a-0d6f6f1f2a10')
    await expect(copyRouteToTrip('prague-culture')).rejects.toThrow('redirect /trip/7c0b4a52')
    const [routeId, data] = vi.mocked(createTrip).mock.calls[0]
    expect(routeId).toBe('prague-culture')
    expect(data.stops).toEqual(route.stops)
    expect(nav.redirect).toHaveBeenCalledWith('/trip/7c0b4a52-6c1e-4f43-9d2a-0d6f6f1f2a10', 'replace')
  })

  it('sends a guest to sign in and back (Scenario: Без входа)', async () => {
    vi.mocked(createTrip).mockResolvedValue(null)
    await expect(copyRouteToTrip('prague-culture')).rejects.toThrow('redirect')
    expect(nav.redirect).toHaveBeenCalledWith('/login?next=%2Ftrip%2Fnew%3Froute%3Dprague-culture', 'replace')
  })

  it('reports an unknown route and a failed database', async () => {
    vi.mocked(loadRoute).mockResolvedValueOnce(null)
    expect(await copyRouteToTrip('nowhere')).toEqual({ error: 'Маршрут не найден' })
    vi.mocked(createTrip).mockRejectedValueOnce(new Error('down'))
    expect(await copyRouteToTrip('prague-culture')).toEqual({
      error: 'Не получилось скопировать маршрут, попробуйте ещё раз',
    })
  })
})

describe('saveTripEdits', () => {
  it('reports someone else’s plan and a failed save without details', async () => {
    vi.mocked(saveTrip).mockResolvedValueOnce(true)
    expect(await saveTripEdits('id', {})).toEqual({})
    vi.mocked(saveTrip).mockResolvedValueOnce(false)
    expect(await saveTripEdits('id', {})).toEqual({ error: 'План не найден' })
    vi.mocked(saveTrip).mockRejectedValueOnce(new Error('План не прошёл проверку: день'))
    expect(await saveTripEdits('id', {})).toEqual({ error: 'Не удалось сохранить план' })
  })
})

// trip-plan, Requirement: Замена отеля
describe('similarHotelScores', () => {
  it('spreads the scores of the embeddings over 0…1 and sends only valid ids as the profile', async () => {
    vi.mocked(similarHotels).mockResolvedValueOnce([
      { id: 'a', score: 0.82 },
      { id: 'b', score: 0.8 },
      { id: 'c', score: 0.78 },
    ])
    const scores = await similarHotelScores('prague-x', ['prague-y', 'DROP TABLE'])
    expect(scores).toEqual({ a: 1, b: expect.closeTo(0.5), c: 0 })
    expect(similarHotels).toHaveBeenCalledWith('prague-x', ['prague-y'], 100)
  })

  it('is null without vectors or for a malformed id', async () => {
    vi.mocked(similarHotels).mockResolvedValueOnce(null)
    expect(await similarHotelScores('prague-x', [])).toBeNull()
    expect(await similarHotelScores('../x', [])).toBeNull()
  })
})
