import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mocks = vi.hoisted(() => ({ hotels: vi.fn() }))
vi.mock('@/lib/db/claims', () => ({ loadHotelierHotels: mocks.hotels }))

beforeEach(() => mocks.hotels.mockReset())

describe('GET /api/hotelier/hotels', () => {
  it('lists the hotels with the hotelier’s characteristics for the search results', async () => {
    mocks.hotels.mockResolvedValue([{ hotelId: 'ota-1', facts: 3, demo: true }])
    const response = await GET(new Request('http://localhost/api/hotelier/hotels'))
    expect(await response.json()).toEqual({ hotels: [{ hotelId: 'ota-1', facts: 3, demo: true }] })
    expect(response.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('is 503 when the store fails', async () => {
    mocks.hotels.mockResolvedValue(null)
    expect((await GET(new Request('http://localhost/api/hotelier/hotels'))).status).toBe(503)
  })
})
