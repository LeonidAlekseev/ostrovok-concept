import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as writeToHotel } from '../hotels/[hotelId]/hotelier/messages/route'
import { POST as answer } from './conversations/[conversationId]/messages/route'
import { POST as setStatus } from './conversations/[conversationId]/status/route'

const mocks = vi.hoisted(() => ({
  client: {} as object | null,
  userId: 'u1' as string | null,
  allowed: true,
  hotel: { id: 'ota-1' } as object | undefined,
  traveller: vi.fn(),
  hotelier: vi.fn(),
  status: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }))
vi.mock('@/lib/ai/rateLimit', () => ({ allowRequest: async () => mocks.allowed, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/api', async (load) => ({
  ...(await load<typeof import('@/lib/api')>()),
  loadVisibleHotel: async () => mocks.hotel,
}))
vi.mock('@/lib/db/hotelierChat', () => ({
  signedInUser: async () => mocks.userId,
  sendTravellerMessage: mocks.traveller,
  sendHotelierMessage: mocks.hotelier,
  setConversationStatus: mocks.status,
}))

const ID = '6f1c1d6e-2f4a-4c55-9d3b-0b9a3f1e2a10'
const request = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const hotelParams = { params: Promise.resolve({ hotelId: 'ota-1' }) }
const conversationParams = (conversationId = ID) => ({ params: Promise.resolve({ conversationId }) })

beforeEach(() => {
  mocks.client = {}
  mocks.userId = 'u1'
  mocks.allowed = true
  mocks.hotel = { id: 'ota-1' }
  mocks.traveller
    .mockReset()
    .mockResolvedValue({ ok: true, value: { conversation: { id: ID }, message: { id: 'm1' } } })
  mocks.hotelier.mockReset().mockResolvedValue({ ok: true, value: { id: 'm2' } })
  mocks.status.mockReset().mockResolvedValue({ ok: true, value: { id: ID, status: 'resolved' } })
})

describe('POST /api/hotels/{hotelId}/hotelier/messages', () => {
  it('writes the traveller’s trimmed text to the hotel', async () => {
    const response = await writeToHotel(request({ text: '  Есть балкон?  ' }), hotelParams)
    expect(response.status).toBe(200)
    expect(mocks.traveller).toHaveBeenCalledWith(mocks.client, 'u1', 'ota-1', 'Есть балкон?')
  })

  it.each([
    ['an empty text', { text: '   ' }, 400],
    ['a text too long', { text: 'а'.repeat(2001) }, 400],
    ['not JSON', 'text', 400],
  ])('refuses %s', async (_name, body, status) => {
    expect((await writeToHotel(request(body), hotelParams)).status).toBe(status)
    expect(mocks.traveller).not.toHaveBeenCalled()
  })

  it('is a signed-in traveller’s only, within the limits, for a hotel shown', async () => {
    mocks.userId = null
    expect((await writeToHotel(request({ text: 'Да?' }), hotelParams)).status).toBe(401)
    mocks.userId = 'u1'
    mocks.allowed = false
    expect((await writeToHotel(request({ text: 'Да?' }), hotelParams)).status).toBe(429)
    mocks.allowed = true
    mocks.hotel = undefined
    expect((await writeToHotel(request({ text: 'Да?' }), hotelParams)).status).toBe(404)
    mocks.client = null
    expect((await writeToHotel(request({ text: 'Да?' }), hotelParams)).status).toBe(503)
    expect(mocks.traveller).not.toHaveBeenCalled()
  })

  it.each([
    ['closed', 409],
    ['rate_limited', 429],
    ['forbidden', 403],
    ['store', 503],
  ])('answers the database’s %s with %i', async (failure, status) => {
    mocks.traveller.mockResolvedValueOnce({ ok: false, failure })
    expect((await writeToHotel(request({ text: 'Да?' }), hotelParams)).status).toBe(status)
  })
})

describe('POST /api/hotelier/conversations/{conversationId}/messages', () => {
  it('writes the hotelier’s answer with its sharing and request', async () => {
    const body = { text: 'Да, на 4–5 этажах', shareable: true, requestId: ID }
    expect((await answer(request(body), conversationParams())).status).toBe(200)
    expect(mocks.hotelier).toHaveBeenCalledWith(mocks.client, 'u1', ID, body)
  })

  it('shares nothing unless asked', async () => {
    await answer(request({ text: 'Да' }), conversationParams())
    expect(mocks.hotelier.mock.calls[0][3]).toEqual({ text: 'Да', shareable: false })
  })

  it('refuses a bad id, a bad body, a guest and another hotel’s hotelier', async () => {
    expect((await answer(request({ text: 'Да' }), conversationParams('x'))).status).toBe(404)
    expect((await answer(request({ text: 'Да', requestId: 'x' }), conversationParams())).status).toBe(400)
    mocks.userId = null
    expect((await answer(request({ text: 'Да' }), conversationParams())).status).toBe(401)
    mocks.userId = 'u1'
    mocks.hotelier.mockResolvedValueOnce({ ok: false, failure: 'forbidden' })
    expect((await answer(request({ text: 'Да' }), conversationParams())).status).toBe(403)
  })
})

describe('POST /api/hotelier/conversations/{conversationId}/status', () => {
  it('sets the states the panel offers, only them', async () => {
    expect((await setStatus(request({ status: 'resolved' }), conversationParams())).status).toBe(200)
    expect(mocks.status).toHaveBeenCalledWith(mocks.client, ID, 'resolved')
    expect((await setStatus(request({ status: 'waiting_hotelier' }), conversationParams())).status).toBe(400)
    mocks.status.mockResolvedValueOnce({ ok: false, failure: 'forbidden' })
    expect((await setStatus(request({ status: 'closed' }), conversationParams())).status).toBe(403)
  })
})
