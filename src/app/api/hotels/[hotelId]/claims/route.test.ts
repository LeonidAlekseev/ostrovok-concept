import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelClaim } from '@/lib/db/claims'
import { GET } from './route'

const mocks = vi.hoisted(() => ({
  hotel: vi.fn(),
  claims: vi.fn(),
}))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), loadVisibleHotel: mocks.hotel }))
vi.mock('@/lib/db/anon', async (original) => ({
  ...(await original<object>()),
  isRealHotelId: (id: string) => /^ota-\d+$/.test(id),
}))
vi.mock('@/lib/db/claims', () => ({ loadHotelClaims: mocks.claims }))

const claim = (property: string): HotelClaim => ({
  id: property,
  property,
  sourceKey: '',
  value: { kind: 'number', value: 1 },
  unit: 'm',
  status: 'derived',
  confidence: 1,
  method: {},
  observedAt: null,
  validFrom: null,
  validTo: null,
  limitations: [],
  calculation: null,
  evidence: [],
})

const get = (hotelId: string, query = '') =>
  GET(new NextRequest(`http://localhost/api/hotels/${hotelId}/claims${query}`), {
    params: Promise.resolve({ hotelId }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hotel.mockImplementation(async (id: string) => (id === 'nowhere' ? undefined : { id }))
})

// api-docs, Requirement: Знания об отеле в публичном API
describe('GET /api/hotels/{hotelId}/claims', () => {
  it('returns the claims of the prefix with the CDN cache', async () => {
    mocks.claims.mockResolvedValue([claim('noise.a'), claim('noise.b')])
    const response = await get('ota-1', '?property=noise.')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/)
    expect(mocks.claims).toHaveBeenCalledWith('ota-1', 'noise.')
    expect(await response.json()).toMatchObject({ hotelId: 'ota-1', property: 'noise.', truncated: false })
  })

  it('cuts the answer at `limit` and says so', async () => {
    mocks.claims.mockResolvedValue([claim('a.a'), claim('a.b'), claim('a.c')])
    const body = await (await get('ota-1', '?limit=2')).json()
    expect(body.claims.map((c: HotelClaim) => c.property)).toEqual(['a.a', 'a.b'])
    expect(body.truncated).toBe(true)
  })

  it('is 400 for a bad prefix or limit, before it reads anything', async () => {
    for (const query of ["?property=noise'", '?property=a%20b', '?limit=0', '?limit=201', '?limit=x'])
      expect((await get('ota-1', query)).status, query).toBe(400)
    expect(mocks.hotel).not.toHaveBeenCalled()
  })

  it('is 404 for an unknown, hidden or synthetic hotel', async () => {
    expect((await get('nowhere')).status).toBe(404)
    expect((await get('prague-old-town-lantern')).status).toBe(404)
    expect(mocks.claims).not.toHaveBeenCalled()
  })

  it('is 503 when the store cannot be read, and an empty list is still 200', async () => {
    mocks.claims.mockResolvedValue(null)
    const failed = await get('ota-1')
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBeNull()
    mocks.claims.mockResolvedValue([])
    expect((await (await get('ota-1')).json()).claims).toEqual([])
  })
})
