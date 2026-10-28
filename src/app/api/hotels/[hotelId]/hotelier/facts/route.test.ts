import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelClaim } from '@/lib/db/claims'
import { GET } from './route'

const mocks = vi.hoisted(() => ({ hotel: vi.fn(), claims: vi.fn(), later: [] as (() => unknown)[], retry: vi.fn() }))
vi.mock('next/server', async (load) => ({
  ...(await load<typeof import('next/server')>()),
  after: (callback: () => unknown) => void mocks.later.push(callback),
}))
vi.mock('@/lib/db/hotelierKnowledge', () => ({ retryDueHotelierKnowledge: mocks.retry }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), loadVisibleHotel: mocks.hotel }))
vi.mock('@/lib/db/anon', async (original) => ({
  ...(await original<object>()),
  isRealHotelId: (id: string) => /^ota-\d+$/.test(id),
}))
vi.mock('@/lib/db/claims', () => ({ loadHotelierClaims: mocks.claims }))

const claim = (id: string, value: HotelClaim['value'], extra: Partial<HotelClaim> = {}): HotelClaim => ({
  id,
  property: 'hotelier.room.window_side',
  sourceKey: `hotelier:${id}`,
  value,
  unit: null,
  status: 'reported',
  confidence: 0.75,
  method: { room: 'Premium' },
  observedAt: '2026-10-18T14:20:00.000Z',
  validFrom: null,
  validTo: null,
  limitations: ['Сообщено отельером, сервис это не проверял'],
  calculation: null,
  evidence: [
    {
      id: 'e1',
      role: 'source',
      type: 'hotelier',
      title: 'Ответ отельера',
      provider: 'Отельер',
      externalId: 'm1',
      url: null,
      retrievedAt: '2026-10-18T14:20:00.000Z',
      excerpt: 'Со слов отельера, номера Premium: сторона окон — во внутренний двор.',
      datasetId: null,
      demo: true,
    },
  ],
  demo: true,
  ...extra,
})

const get = (hotelId: string) => GET(new Request('http://localhost'), { params: Promise.resolve({ hotelId }) })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hotel.mockImplementation(async (id: string) => (id === 'nowhere' ? undefined : { id }))
})

describe('GET /api/hotels/{hotelId}/hotelier/facts', () => {
  it('gives the hotelier’s characteristics fresh, the contradicting ones marked, the demo ones flagged', async () => {
    mocks.claims.mockResolvedValue([
      claim('c1', { kind: 'text', value: 'во внутренний двор' }),
      claim('c2', { kind: 'text', value: 'часть — на улицу' }),
      claim('c3', { kind: 'boolean', value: true }, { property: 'hotelier.room.balcony', demo: undefined }),
    ])
    const response = await get('ota-7480161')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { facts } = await response.json()
    expect(facts).toHaveLength(3)
    expect(facts[0]).toMatchObject({
      characteristic: 'room.window_side',
      label: 'Сторона окон',
      room: 'Premium',
      value: 'во внутренний двор',
      confidence: 0.75,
      conflict: true,
      demo: true,
      source: { title: 'Ответ отельера' },
    })
    expect(facts[2]).toMatchObject({ label: 'Балкон в номере', value: 'да', conflict: false, demo: false })
  })

  it('is 404 for a synthetic or unknown hotel and 503 when the store fails', async () => {
    expect((await get('prague-old-town-lantern')).status).toBe(404)
    expect((await get('nowhere')).status).toBe(404)
    mocks.claims.mockResolvedValue(null)
    expect((await get('ota-1')).status).toBe(503)
  })

  it('tries the answers whose knowledge failed again after the response', async () => {
    mocks.later.length = 0
    await get('nowhere')
    expect(mocks.retry).not.toHaveBeenCalled()
    for (const callback of mocks.later.splice(0)) await callback()
    expect(mocks.retry).toHaveBeenCalledTimes(1)
  })
})
