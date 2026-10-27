import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelRelation } from '@/lib/db/knowledge'
import { GET } from './route'

const mocks = vi.hoisted(() => ({ hotel: vi.fn(), relations: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), loadVisibleHotel: mocks.hotel }))
vi.mock('@/lib/db/anon', async (original) => ({
  ...(await original<object>()),
  isRealHotelId: (id: string) => /^ota-\d+$/.test(id),
}))
vi.mock('@/lib/db/knowledge', () => ({ loadHotelRelations: mocks.relations }))

const relation = (ref: string): HotelRelation => ({
  id: ref,
  predicate: 'near',
  confidence: 1,
  object: { kind: 'osm_place', ref, name: null, lat: 39.38, lon: -0.33, categories: ['pharmacy'] },
  claim: null,
  evidence: null,
})

const get = (hotelId: string, query = '') =>
  GET(new NextRequest(`http://localhost/api/hotels/${hotelId}/relations${query}`), {
    params: Promise.resolve({ hotelId }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hotel.mockImplementation(async (id: string) => (id === 'nowhere' ? undefined : { id }))
})

// api-docs, Requirement: Знания об отеле в публичном API
describe('GET /api/hotels/{hotelId}/relations', () => {
  it('filters by predicate and category and returns the edges with the CDN cache', async () => {
    mocks.relations.mockResolvedValue([relation('node/1')])
    const response = await get('ota-1', '?predicate=near&category=pharmacy')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/)
    expect(mocks.relations).toHaveBeenCalledWith({ id: 'ota-1' }, { predicate: 'near', category: 'pharmacy' })
    expect(await response.json()).toMatchObject({ hotelId: 'ota-1', truncated: false, relations: [{ id: 'node/1' }] })
  })

  it('cuts the answer at `limit` and says so', async () => {
    mocks.relations.mockResolvedValue([relation('node/1'), relation('node/2'), relation('node/3')])
    const body = await (await get('ota-1', '?limit=2')).json()
    expect(body.relations).toHaveLength(2)
    expect(body.truncated).toBe(true)
  })

  it('is 400 for a bad predicate, an unknown category or a bad limit', async () => {
    for (const query of ['?predicate=Near', '?predicate=a.b', '?category=casino', '?limit=0', '?limit=101'])
      expect((await get('ota-1', query)).status, query).toBe(400)
    expect(mocks.relations).not.toHaveBeenCalled()
  })

  it('is 404 for an unknown, hidden or synthetic hotel', async () => {
    expect((await get('nowhere')).status).toBe(404)
    expect((await get('prague-old-town-lantern')).status).toBe(404)
    expect(mocks.relations).not.toHaveBeenCalled()
  })

  it('is 503 when the store cannot be read', async () => {
    mocks.relations.mockResolvedValue(null)
    expect((await get('ota-1')).status).toBe(503)
  })
})
