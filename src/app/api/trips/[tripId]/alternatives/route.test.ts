import type { LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import { getAssistantModel } from '@/lib/ai/model'
import { loadTrip } from '@/lib/db/trips'
import { ALTERNATIVES_ERROR, copyRoute } from '@/lib/trip'
import { POST } from './route'

vi.mock('@/lib/ai/model', () => ({ getAssistantModel: vi.fn() }))
vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))
vi.mock('@/lib/db/trips', () => ({ loadTrip: vi.fn() }))

const TRIP_ID = '7c0b4a52-6c1e-4f43-9d2a-0d6f6f1f2a10'
const trip = copyRoute(seedRoutes[0], '2026-11-02')
const concert = trip.leisure[1]

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}
const answer = (options: unknown[]) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ options }) }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
})
const good = [
  { title: 'Джазовый вечер в клубе «Агарта»', category: 'Концерт', minutes: 100, price: 1720 },
  { title: 'Чёрный театр', category: 'Театр', minutes: 75, price: 2100 },
  { title: 'Ужин на кораблике по Влтаве', category: 'Прогулка', minutes: 150, price: 4300 },
]

function setModel(model: MockLanguageModelV4 | undefined) {
  vi.mocked(getAssistantModel).mockResolvedValue(model as LanguageModel | undefined)
}

let ip = 0
const post = (body: unknown = { leisure: concert, start: trip.start }) =>
  POST(
    new Request(`http://localhost/api/trips/${TRIP_ID}/alternatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tripId: TRIP_ID }) },
  )

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(loadTrip).mockResolvedValue({ id: TRIP_ID, trip, hotels: {}, updatedAt: '' })
})
afterEach(() => vi.restoreAllMocks())

// trip-plan, Requirement: Альтернативы досуга
describe('POST /api/trips/<id>/alternatives', () => {
  it('asks the model for three options for the city, the day and the time, without reasoning', async () => {
    const model = new MockLanguageModelV4({ doGenerate: answer(good) })
    setModel(model)
    const response = await post()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      options: [
        { title: 'Джазовый вечер в клубе «Агарта»', category: 'Концерт', minutes: 105, price: 1700 },
        { title: 'Чёрный театр', category: 'Театр', minutes: 75, price: 2100 },
        { title: 'Ужин на кораблике по Влтаве', category: 'Прогулка', minutes: 150, price: 4300 },
      ],
    })
    const [call] = model.doGenerateCalls
    const system = String(call.prompt[0].content)
    expect(system).toContain('Город: Прага')
    expect(system).toContain('День поездки 2')
    expect(system).toContain('в 19:00')
    expect(system).toContain('«Музей Альфонса Мухи»')
    expect(call.providerOptions).toMatchObject({ openrouter: { reasoning: { effort: 'none' } } })
  })

  it('drops options with Latin letters and fails without three good ones', async () => {
    setModel(
      new MockLanguageModelV4({
        doGenerate: answer([good[0], good[1], { ...good[2], title: 'Jazz Dock' }]),
      }),
    )
    const response = await post()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: ALTERNATIVES_ERROR })
  })

  it('gives the model 8 seconds (Scenario: Модель недоступна)', async () => {
    const clock = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal)
    setModel(
      new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))
            clock.abort(new DOMException('The operation timed out.', 'TimeoutError'))
          }),
      }),
    )
    const response = await post()
    expect(timeout).toHaveBeenCalledWith(8000)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Не получилось предложить, попробуйте ещё раз' })
  })

  it('does not find someone else’s plan and rejects a broken body', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer(good) }))
    vi.mocked(loadTrip).mockResolvedValueOnce(null)
    expect((await post()).status).toBe(404)
    expect((await post({ leisure: { ...concert, time: '7pm' }, start: trip.start })).status).toBe(400)
  })

  it('answers with the error without a key', async () => {
    setModel(undefined)
    expect((await post()).status).toBe(503)
  })
})
