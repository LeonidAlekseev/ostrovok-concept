import { APICallError, type LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelLink } from '@/lib/ai/chain'
import { getTextModels, getVisionModels } from '@/lib/ai/model'
import { allowVisionRequest } from '@/lib/ai/rateLimit'
import { semanticSearch } from '@/lib/ai/semantic'
import { loadHotelFeatures } from '@/lib/db/features'
import type { HotelFeatures } from '@/lib/features'
import { nextQuestion } from '@/lib/assistant'
import { getHotel } from '@/lib/catalogGenerator'
import { POST } from './route'

vi.mock('@/lib/ai/model', () => ({ getTextModels: vi.fn(), getVisionModels: vi.fn() }))
vi.mock('@/lib/ai/semantic', () => ({ SEMANTIC_TIMEOUT_MS: 8000, semanticSearch: vi.fn() }))
vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))
vi.mock('@/lib/db/features', () => ({ loadHotelFeatures: vi.fn() }))

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}

const answer = (fields: Record<string, unknown>) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        destinationId: null,
        vibe: null,
        when: null,
        nights: null,
        party: null,
        mood: null,
        budget: null,
        reply: 'Отличная идея!',
        ...fields,
      }),
    },
  ],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
})

/** A chain of `models` in order, each with `timeoutMs`. */
const chain = (models: MockLanguageModelV4[], timeoutMs = 9000): ModelLink[] =>
  models.map((model, i) => ({ id: `model-${i + 1}`, model: model as LanguageModel, timeoutMs }))

/** The text chain of one model, or none (no key). */
function setModel(model: MockLanguageModelV4 | undefined) {
  vi.mocked(getTextModels).mockResolvedValue(model && chain([model]))
}

const failing = (message: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(message)
    },
  })

let ip = 0
/** Each request comes from its own address unless one is given, so the rate limit stays out of the way. */
function post(body: unknown, address = `10.0.0.${++ip}`) {
  return POST(
    new Request('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': address },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

const ask = (text: string, brief = {}) => post({ messages: [{ role: 'user', text }], brief })

beforeEach(() => {
  vi.mocked(getVisionModels).mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(semanticSearch).mockResolvedValue({ status: 'empty' })
  vi.mocked(loadHotelFeatures).mockResolvedValue(new Map())
})
afterEach(() => {
  vi.restoreAllMocks()
})

// assistant-search, Requirement: Разбор пожелания
describe('POST /api/assistant', () => {
  it('reads the wish with the rules without a key (Scenario: Модель недоступна)', async () => {
    setModel(undefined)
    const response = await ask('Хочу на море в октябре, бюджет до 70 000 ₽')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ brief: { vibe: 'sea', when: 9, budget: 70000 }, source: 'rules' })
  })

  it('reads a free phrase with the model (Scenario: Свободная фраза)', async () => {
    const model = new MockLanguageModelV4({ doGenerate: answer({ vibe: 'sea', budget: 50000 }) })
    setModel(model)
    const response = await ask('хочу туда, где тепло и можно поплавать с маской, недорого')
    expect(await response.json()).toEqual({
      brief: { vibe: 'sea', budget: 50000 },
      reply: 'Отличная идея!',
      source: 'model',
    })

    // The model gets the catalog, today's date and the conversation; the answer is a JSON object.
    const [call] = model.doGenerateCalls
    const system = call.prompt[0]
    expect(system.role).toBe('system')
    expect(system.content).toContain('prague — Прага')
    expect(system.content).toContain('sea — море')
    expect(system.content).toMatch(/Сегодня \d{4}-\d{2}-\d{2}/)
    expect(call.prompt.at(-1)).toMatchObject({ role: 'user' })
    expect(call.responseFormat).toMatchObject({ type: 'json' })
  })

  it('normalizes the model answer: catalog cities only, whole budget, 1–30 nights, months 1–12', async () => {
    setModel(
      new MockLanguageModelV4({
        doGenerate: answer({
          destinationId: 'atlantis',
          vibe: 'space',
          when: '10',
          nights: 45,
          party: 'couple',
          mood: 'sleepy',
          budget: 69999.6,
        }),
      }),
    )
    const { brief } = await (await ask('вдвоём в октябре на 45 ночей')).json()
    expect(brief).toEqual({ when: 9, nights: 30, party: 'couple', budget: 70000 })
  })

  it('keeps a known catalog city', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({ destinationId: 'prague', when: 'soon' }) }))
    expect((await (await ask('в Прагу, и скорее бы — завтра')).json()).brief).toEqual({
      destinationId: 'prague',
      when: 'soon',
    })
  })

  // What the live nemotron answered without reasoning: the theme is right, the rest is made up.
  const madeUp = { destinationId: 'zakynthos', nights: 7, party: 'solo', when: 'soon', mood: 'active' }
  const answeredBy = (fields: Record<string, unknown>) =>
    setModel(new MockLanguageModelV4({ doGenerate: answer({ ...madeUp, ...fields }) }))

  it('keeps only what the full request says and asks who goes (Scenario: Полный запрос)', async () => {
    answeredBy({ vibe: 'sea', when: '10', budget: 70000 })
    const { brief } = await (await ask('Хочу на море в октябре, бюджет до 70 000 ₽')).json()
    expect(brief).toEqual({ vibe: 'sea', when: 9, budget: 70000 })
    expect(nextQuestion(brief, '2026-10-21')?.id).toBe('party')
  })

  it('keeps the theme of a free phrase and asks when (Scenario: Свободная фраза)', async () => {
    answeredBy({ vibe: 'sea', reply: '탐험 Анталья — отличный выбор!' })
    const response = await (await ask('хочу туда, где тепло и можно поплавать с маской, недорого')).json()
    expect(response).toEqual({ brief: { vibe: 'sea' }, source: 'model' })
    expect(nextQuestion(response.brief, '2026-10-21')?.id).toBe('when')
  })

  it('keeps the made-up fields once the message backs them', async () => {
    answeredBy({ vibe: 'sea', when: 'soon' })
    const { brief } = await (await ask('на море одна, на 7 ночей, в ближайшее время, хочу активно')).json()
    expect(brief).toEqual({ vibe: 'sea', when: 'soon', nights: 7, party: 'solo', mood: 'active' })
  })

  it("drops a city the message does not name and the model's own «any»", async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({ vibe: 'sea', destinationId: 'zakynthos', party: 'any' }) }))
    const { brief } = await (await ask('хочу туда, где тепло и можно поплавать с маской')).json()
    expect(brief).toEqual({ vibe: 'sea' })
  })

  it('reads the hotel criteria with the model when the message backs them', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({ height: 'high', quiet: true, view: 'any' }) }))
    const { brief } = await (await ask('а повыше?', { destinationId: 'lisbon', quiet: true })).json()
    // «а повыше?» says nothing of the view: the model's guess is dropped, the earlier quiet stays.
    expect(brief).toEqual({ destinationId: 'lisbon', quiet: true, height: 'high' })
    setModel(new MockLanguageModelV4({ doGenerate: answer({ view: 'any' }) }))
    expect((await (await ask('чтобы был красивый вид из окна')).json()).brief).toEqual({ view: 'any' })
  })

  it('turns reasoning off for the 9 seconds', async () => {
    const model = new MockLanguageModelV4({ doGenerate: answer({}) })
    setModel(model)
    await ask('море')
    expect(model.doGenerateCalls[0].reasoning).toBe('none')
  })

  it('adds the answer to what is understood (Scenario: Уточнение темы)', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({ vibe: 'weekend', when: 'soon', nights: 2 }) }))
    const { brief } = await (await ask('на выходные', { vibe: 'sea', budget: 70000 })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 'soon', nights: 2, budget: 70000 })
  })

  it('hands the asked question to the assistant (Scenario: Довериться ассистенту)', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({}) }))
    // The brief lacks the dates, so "не важно" answers "Когда планируете поехать?".
    const { brief } = await (await ask('не важно', { vibe: 'sea' })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 'any' })
  })

  it('falls back to the rules when the model fails', async () => {
    setModel(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('429 Rate limit exceeded')
        },
      }),
    )
    const response = await ask('Хочу на море в октябре, бюджет до 70 000 ₽')
    expect(await response.json()).toEqual({
      brief: { vibe: 'sea', when: 9, budget: 70000 },
      source: 'rules',
      modelsDown: true,
    })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('429 Rate limit exceeded'))
  })

  it('falls back to the rules when the answer is not JSON', async () => {
    setModel(
      new MockLanguageModelV4({
        doGenerate: { ...answer({}), content: [{ type: 'text', text: 'Конечно! Море — отличный выбор.' }] },
      }),
    )
    expect(await (await ask('в горы')).json()).toEqual({
      brief: { vibe: 'mountains' },
      source: 'rules',
      modelsDown: true,
    })
  })

  it('gives the model one attempt of 9 seconds, then the rules (Scenario: Модель недоступна)', async () => {
    const clock = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal)
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))
          clock.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        }),
    })
    setModel(model)
    const response = await ask('в горы')
    expect(timeout).toHaveBeenCalledWith(9000)
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(await response.json()).toEqual({ brief: { vibe: 'mountains' }, source: 'rules', modelsDown: true })
  })

  it('asks the next text model with the same chat when one fails (Scenario: Запасная текстовая модель)', async () => {
    const first = failing('500 Internal Server Error')
    const second = new MockLanguageModelV4({ doGenerate: answer({ vibe: 'sea' }) })
    vi.mocked(getTextModels).mockResolvedValue(chain([first, second]))
    const response = await post({
      messages: [
        { role: 'user', text: 'Хочу отдохнуть' },
        { role: 'assistant', text: 'Куда хотите?' },
        { role: 'user', text: 'туда, где тепло и можно поплавать' },
      ],
      brief: {},
    })
    expect(await response.json()).toMatchObject({ brief: { vibe: 'sea' }, source: 'model' })
    expect(second.doGenerateCalls[0].prompt).toEqual(first.doGenerateCalls[0].prompt)
    expect(second.doGenerateCalls[0].prompt.filter((m) => m.role !== 'system')).toHaveLength(3)
  })

  it('keeps the text chain within its 9 s, then the rules and the warning (Scenario: Ни одна модель не ответила)', async () => {
    const times: number[] = []
    const real = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      times.push(ms)
      return real(ms)
    })
    // Each model stalls for the whole time the chain gives it (the time before understandWish's own cap).
    const stalls = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          vi.setSystemTime(Date.now() + times.at(-2)!)
          throw new DOMException('The operation timed out.', 'TimeoutError')
        },
      })
    const models = [stalls(), stalls(), stalls()]
    vi.mocked(getTextModels).mockResolvedValue(chain(models, 3000))
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const body = await (await ask('в горы')).json()
    const spent = Date.now() - start
    vi.useRealTimers()
    expect(body).toEqual({ brief: { vibe: 'mountains' }, source: 'rules', modelsDown: true })
    expect(models.map((m) => m.doGenerateCalls.length)).toEqual([1, 1, 1])
    expect(spent).toBe(9000)
  })

  it('gives minimax the 2 s left when lightning and bolt stall (Scenario: Две модели зависли)', async () => {
    // Each stall lasts the model's own time: lightning 3,5 s, bolt 3,5 s; the rest of the 9 s is minimax's.
    const stall = (ms: number) =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          vi.setSystemTime(Date.now() + ms)
          throw new DOMException('The operation timed out.', 'TimeoutError')
        },
      })
    const lightning = stall(3500)
    const bolt = stall(3500)
    const minimax = new MockLanguageModelV4({ doGenerate: answer({ vibe: 'mountains' }) })
    vi.mocked(getTextModels).mockResolvedValue([
      { id: 'lightning', model: lightning as LanguageModel, timeoutMs: 3500 },
      { id: 'bolt', model: bolt as LanguageModel, timeoutMs: 3500 },
      { id: 'minimax', model: minimax as LanguageModel, timeoutMs: 5000 },
    ])
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.useFakeTimers({ toFake: ['Date'] })
    const body = await (await ask('в горы')).json()
    vi.useRealTimers()
    expect(lightning.doGenerateCalls).toHaveLength(1)
    expect(bolt.doGenerateCalls).toHaveLength(1)
    expect(minimax.doGenerateCalls).toHaveLength(1)
    expect(timeout).toHaveBeenCalledWith(2000)
    expect(body).toMatchObject({ brief: { vibe: 'mountains' }, source: 'model' })
  })

  it('cleans the brief sent by the client', async () => {
    setModel(undefined)
    const { brief } = await (await ask('вдвоём', { vibe: 'sea', when: 9, budget: -5, destinationId: 'x' })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 9, party: 'couple' })
  })

  it('rejects long messages, long histories and broken bodies', async () => {
    setModel(undefined)
    expect((await ask('а'.repeat(501))).status).toBe(400)
    expect((await ask('а'.repeat(500))).status).toBe(200)
    const history = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'море' }))
    expect((await post({ messages: history, brief: {} })).status).toBe(400)
    expect((await post({ messages: history.slice(-20).reverse(), brief: {} })).status).toBe(400)
    expect((await post({ messages: history.slice(0, 19), brief: {} })).status).toBe(200)
    expect((await post({ messages: [], brief: {} })).status).toBe(400)
    expect((await post('{')).status).toBe(400)
  })

  it('limits each address to 20 requests a minute', async () => {
    setModel(undefined)
    const body = { messages: [{ role: 'user', text: 'море' }], brief: {} }
    for (let i = 0; i < 20; i++) expect((await post(body, '192.0.2.1')).status).toBe(200)
    expect((await post(body, '192.0.2.1')).status).toBe(429)
    expect((await post(body, '192.0.2.2')).status).toBe(200)
  })
})

describe('POST /api/assistant: the semantic search', () => {
  const complete = { destinationId: 'prague', when: 5, party: 'solo' }
  const hit = (id: string) => ({ id, destinationId: 'prague', score: 0.9 })
  const found = (...ids: string[]) => ({ status: 'found' as const, hits: ids.map(hit) })

  it('adds the hotels found for all the traveller’s words in the plan’s cities once the plan is due', async () => {
    setModel(undefined)
    vi.mocked(semanticSearch).mockResolvedValue(found('prague-skyline-hostel', 'unknown', 'prague-central-hostel'))
    const response = await post({
      messages: [
        { role: 'user', text: 'тихий хостел с быстрым Wi‑Fi' },
        { role: 'assistant', text: 'Куда?' },
        { role: 'user', text: 'в Прагу' },
      ],
      brief: complete,
    })
    const body = await response.json()
    const { matches } = body
    expect(matches.map((h: { id: string }) => h.id)).toEqual(['prague-skyline-hostel', 'prague-central-hostel'])
    const [text, options] = vi.mocked(semanticSearch).mock.calls[0]
    expect(text).toBe('тихий хостел с быстрым Wi‑Fi. в Прагу')
    expect(options).toMatchObject({ destinationIds: ['prague'] })
    // Only the hotels: no search for routes, no route in the answer.
    expect(semanticSearch).toHaveBeenCalledTimes(1)
    expect(body).not.toHaveProperty('routeId')
  })

  it('does not search while the assistant still has a question', async () => {
    setModel(undefined)
    expect((await (await ask('море')).json()).matches).toBeUndefined()
    expect(semanticSearch).not.toHaveBeenCalled()
  })

  it('answers by the rules when the search is unavailable', async () => {
    setModel(undefined)
    const body = await (await ask('тихо', complete)).json()
    expect(semanticSearch).toHaveBeenCalledTimes(1)
    expect(body.matches).toBeUndefined()
    expect(body.source).toBe('rules')
  })
})

// assistant-search, Requirements: Подбор по свойствам здания и окружения, Шаги агентов в чате
describe('POST /api/assistant: the steps and the hotel features', () => {
  const complete = { destinationId: 'lisbon', when: 9, party: 'solo' }
  // The tests' catalogue has no Valencia (its hotels are real): Lisbon's made-up hotels stand in with made-up data.
  const lisbon = async () => (await import('@/test/catalog')).loadCityHotels(['lisbon'])
  const features = (entries: [string, Omit<HotelFeatures, 'views'> & Partial<HotelFeatures>][]) =>
    vi.mocked(loadHotelFeatures).mockResolvedValue(new Map(entries.map(([id, f]) => [id, { views: [], ...f }])))

  it('runs the turn as steps once the plan is due (Scenario: Шаг агента)', async () => {
    setModel(undefined)
    const body = await (await ask('подбери что-нибудь', complete)).json()
    expect(body.steps).toEqual([
      { agent: 'search', title: 'Подбираю отели по вашему описанию', status: 'done', result: 'подобрал по каталогу' },
    ])
    expect((await (await ask('море')).json()).steps).toBeUndefined()
  })

  it('offers the hotels with the quietest nights and names the noise (Scenario: Тихий отель)', async () => {
    setModel(undefined)
    const [a, b, c] = await lisbon()
    features([
      [a.id, { lnight: { min: 60, max: 64 }, floors: 5 }],
      [b.id, { lnight: { max: 39 }, floors: 3 }],
      [c.id, { lnight: { min: 45, max: 49 }, floors: 12 }],
    ])
    const body = await (await ask('тихий отель, чтобы ночью не шумело', complete)).json()
    expect(body.brief).toMatchObject({ quiet: true })
    expect(body.matches.map((h: { id: string }) => h.id)).toEqual([b.id, c.id, a.id])
    expect(body.features[b.id].lnight).toEqual({ max: 39 })
    expect(body.steps.at(-1)).toEqual({
      agent: 'features',
      title: 'Проверяю данные о шуме',
      status: 'done',
      result: `подходят 3 отеля из ${(await lisbon()).length}`,
    })
    expect(body).not.toHaveProperty('missing')
  })

  it('keeps the quiet ones and goes higher on «а повыше?» (Scenario: Уточнение)', async () => {
    setModel(undefined)
    const [a, b, c] = await lisbon()
    features([
      [a.id, { lnight: { max: 39 }, floors: 4 }],
      [b.id, { lnight: { max: 39 }, floors: 15 }],
      [c.id, { lnight: { min: 65, max: 69 }, floors: 24 }],
    ])
    const body = await (await ask('а повыше?', { ...complete, quiet: true })).json()
    expect(body.brief).toMatchObject({ quiet: true, height: 'high' })
    expect(body.matches.map((h: { id: string }) => h.id)).toEqual([b.id, a.id, c.id])
  })

  it('names the room types with the view (Scenario: Вид не у всех номеров)', async () => {
    setModel(undefined)
    const [a, b] = await lisbon()
    features([
      [a.id, { views: [{ roomName: 'Люкс с видом на море', view: 'sea' }] }],
      [b.id, { views: [{ roomName: 'Номер с видом на город', view: 'city' }] }],
    ])
    const body = await (await ask('номер с видом на море', complete)).json()
    expect(body.matches.map((h: { id: string }) => h.id)).toEqual([a.id])
    expect(body.features[a.id].views).toEqual([{ roomName: 'Люкс с видом на море', view: 'sea' }])
  })

  it('says there is no data instead of guessing (Scenario: Нет данных)', async () => {
    setModel(undefined)
    const body = await (
      await ask('а там шумно? нужен тихий отель', { destinationId: 'prague', when: 9, party: 'solo' })
    ).json()
    expect(body.missing).toEqual(['quiet'])
    expect(body.matches).toBeUndefined()
    expect(body.steps.at(-1)).toMatchObject({ agent: 'features', status: 'done', result: 'нет данных' })
  })

  it('reports a failed step and goes on', async () => {
    setModel(undefined)
    vi.mocked(loadHotelFeatures).mockRejectedValue(new Error('down'))
    const body = await (await ask('тихий отель', complete)).json()
    expect(body.steps.at(-1)).toMatchObject({ agent: 'features', status: 'failed' })
    expect(body.brief).toMatchObject({ quiet: true })
  })
})

// assistant-search, Requirements: Вопрос об отеле, Пометка непроверенного
describe('POST /api/assistant: a question about a hotel', () => {
  const hotelId = 'prague-old-town-lantern'
  const hotel = getHotel(hotelId)!
  const aboutHotel = (text: string, brief: Record<string, unknown> = {}) => ask(text, { hotelId, ...brief })

  it('answers about the hotel by rules without a key: no questions, no plan (Scenario: Номера без дат)', async () => {
    setModel(undefined)
    const body = await (await aboutHotel('Какие номера есть?')).json()
    expect(body).toMatchObject({ brief: { hotelId, destinationId: 'prague' }, source: 'rules' })
    expect(body.reply).toContain(hotel.rooms[0].name)
    expect(body.reply).toContain('Выберите даты')
    expect(body).not.toHaveProperty('matches')
    expect(body).not.toHaveProperty('steps')
    expect(semanticSearch).not.toHaveBeenCalled()
  })

  it('admits it has no places nearby without a key (Scenario: Без модели)', async () => {
    setModel(undefined)
    const { reply, unverified } = await (await aboutHotel('Что рядом с отелем?')).json()
    expect(reply).toContain('данных о местах рядом пока нет')
    expect(unverified).toBeUndefined()
  })

  it('gives the model the hotel’s data and returns its unverified part apart (Scenario: Что рядом)', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ answer: 'В данных мест рядом нет.', unverified: 'Обычно рядом есть кафе.' }),
          },
        ],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage,
        warnings: [],
      },
    })
    setModel(model)
    const body = await (
      await aboutHotel('Что рядом с отелем?', { dates: { checkIn: '2026-11-10', checkOut: '2026-11-12' } })
    ).json()
    expect(body).toMatchObject({
      reply: 'В данных мест рядом нет.',
      unverified: 'Обычно рядом есть кафе.',
      source: 'model',
      brief: { hotelId, dates: { checkIn: '2026-11-10', checkOut: '2026-11-12' } },
    })
    expect(model.doGenerateCalls[0].prompt[0].content).toContain(hotel.name)
  })

  it('falls back to the rules when the model fails', async () => {
    setModel(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('429 Rate limit exceeded')
        },
      }),
    )
    const body = await (await aboutHotel('Есть ли парковка?')).json()
    expect(body.source).toBe('rules')
    expect(body.reply).toMatch(/парковк/i)
    expect(body.modelsDown).toBe(true)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('429 Rate limit exceeded'))
  })

  it('treats an id the catalogue does not know as a chat like any other', async () => {
    setModel(undefined)
    const body = await (await ask('в горы', { hotelId: 'no-such-hotel' })).json()
    expect(body).toEqual({ brief: { vibe: 'mountains' }, source: 'rules' })
  })
})

// assistant-search, Requirement: Что сделать с фото
describe('POST /api/assistant with photos', () => {
  const photo = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4'
  const withPhotos = (text: string, photos = [photo], brief = {}, address?: string) =>
    post({ messages: [{ role: 'user', text }], brief, photos }, address)
  const sight = (fields: Record<string, unknown>) =>
    new MockLanguageModelV4({ doGenerate: answer({ features: [], view: null, place: null, ...fields }) })
  const sees = (fields: Record<string, unknown>) => vi.mocked(getVisionModels).mockResolvedValue(chain([sight(fields)]))
  const httpError = (statusCode: number) =>
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: '', url: 'x', requestBodyValues: {}, statusCode })
      },
    })
  const hit = (id: string) => ({ id, destinationId: 'prague', score: 0.9 })
  const found = (...ids: string[]) => ({ status: 'found' as const, hits: ids.map(hit) })

  it('asks what to do with photos sent without words (Scenario: Фото без текста)', async () => {
    setModel(undefined)
    const body = await (await withPhotos('Фото')).json()
    expect(body).toEqual({ brief: {}, source: 'rules', photo: { action: 'ask' } })
    expect(getVisionModels).not.toHaveBeenCalled()
  })

  it('asks when the text model cannot tell either', async () => {
    setModel(new MockLanguageModelV4({ doGenerate: answer({ intent: 'unclear' }) }))
    const body = await (await withPhotos('смотри, что нашёл')).json()
    expect(body.photo).toEqual({ action: 'ask' })
  })

  it('looks for similar hotels by the photo’s description at once (Scenario: Понятный текст)', async () => {
    setModel(undefined)
    sees({ description: 'Номер в старом городе с деревянными балками.', features: ['старый город'] })
    vi.mocked(semanticSearch).mockResolvedValue(found('prague-skyline-hostel', 'unknown'))
    const body = await (await withPhotos('найди похожий отель')).json()
    expect(body).toMatchObject({
      brief: {},
      source: 'model',
      photo: { action: 'similar', seen: 'Номер в старом городе с деревянными балками.', like: 'старый город' },
      steps: [{ agent: 'search', title: 'Ищу отели, похожие на фото', status: 'done', result: 'нашёл 1' }],
    })
    expect(body.matches.map((h: { id: string }) => h.id)).toEqual(['prague-skyline-hostel'])
    const [text, options] = vi.mocked(semanticSearch).mock.calls[0]
    expect(text).toBe('старый город. Номер в старом городе с деревянными балками')
    expect(options.destinationIds).toBeUndefined()
    // The photos go to the model that sees them as images.
    const [{ model: vision }] = (await vi.mocked(getVisionModels).mock.results[0].value) as {
      model: MockLanguageModelV4
    }[]
    const parts = vision.doGenerateCalls[0].prompt.at(-1)!.content as { type: string }[]
    expect(parts.map((p) => p.type)).toEqual(['file', 'text'])
  })

  it('tries again with other words when the search does not answer, then says so honestly', async () => {
    setModel(undefined)
    sees({ description: 'Номер с видом на море.', features: ['вид на море'] })
    vi.mocked(semanticSearch)
      .mockResolvedValueOnce({ status: 'failed', reason: 'timeout' })
      .mockResolvedValueOnce(found('prague-skyline-hostel'))
    const found1 = await (await withPhotos('найди похожий')).json()
    expect(found1.matches.map((h: { id: string }) => h.id)).toEqual(['prague-skyline-hostel'])
    expect(found1.photo.missed).toBeUndefined()
    const [[first, firstOptions], [retry]] = vi.mocked(semanticSearch).mock.calls
    expect(first).toBe('вид на море. Номер с видом на море')
    expect(retry).toBe('вид на море')
    expect(firstOptions.timeoutMs).toBeLessThanOrEqual(6000)

    // Nothing found is not the search failing, however long it took.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(semanticSearch)
      .mockReset()
      .mockImplementation(async (_, { timeoutMs = 0 }) => {
        vi.setSystemTime(Date.now() + timeoutMs)
        return { status: 'empty' }
      })
    const none = await (await withPhotos('найди похожий')).json()
    vi.useRealTimers()
    expect(none.photo.missed).toBeUndefined()
    expect(none.steps[0]).toMatchObject({ status: 'done', result: 'похожих не нашёл' })

    // A failure, however quick, is the search not answering.
    vi.mocked(semanticSearch).mockReset().mockResolvedValue({ status: 'failed', reason: 'no-key' })
    const missed = await (await withPhotos('найди похожий')).json()
    expect(missed.photo).toMatchObject({ action: 'similar', missed: true })
    expect(missed.matches).toBeUndefined()
    expect(missed.steps).toEqual([
      { agent: 'search', title: 'Ищу отели, похожие на фото', status: 'failed', result: 'поиск не ответил' },
    ])
    expect(semanticSearch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(semanticSearch).mock.calls[1][1].timeoutMs).toBeGreaterThanOrEqual(2000)
  })

  it('looks for nothing by a photo with nothing a hotel is chosen by', async () => {
    setModel(undefined)
    sees({ usable: false, description: 'Только цветные полосы.' })
    for (const text of ['найди похожий', 'Учесть в запросе']) {
      const body = await (await withPhotos(text)).json()
      expect(body).toEqual({
        brief: {},
        source: 'model',
        photo: { action: 'unusable', seen: 'Только цветные полосы.' },
      })
    }
    expect(semanticSearch).not.toHaveBeenCalled()
  })

  it('looks in the chat’s city when it has one', async () => {
    setModel(undefined)
    sees({ description: 'Тихий двор с садом.' })
    await withPhotos('Найти похожие отели', [photo], { destinationId: 'prague' })
    expect(vi.mocked(semanticSearch).mock.calls[0][1].destinationIds).toEqual(['prague'])
  })

  it('adds what the photo shows to the wish and goes on (Scenario: Учесть в запросе)', async () => {
    setModel(undefined)
    sees({ description: 'Вид на море с балкона.', view: 'sea', features: ['балкон'] })
    const body = await (await withPhotos('Учесть в запросе', [photo], { destinationId: 'valencia' })).json()
    expect(body.photo).toEqual({ action: 'refine', seen: 'Вид на море с балкона.' })
    expect(body.brief).toMatchObject({ destinationId: 'valencia', view: 'sea' })
    expect(body.source).toBe('rules')
  })

  it('says it could not look at the photos without the model (Scenario: Без модели фото)', async () => {
    setModel(undefined)
    const body = await (await withPhotos('найди похожий')).json()
    expect(body).toEqual({ brief: {}, source: 'rules', photo: { action: 'unseen' } })
  })

  it('asks the next model that sees photos when one fails, with the same photos (Scenario: Провайдер ответил со второго раза)', async () => {
    setModel(undefined)
    const first = httpError(500)
    const second = sight({ description: 'Номер с видом на море.', features: ['вид на море'] })
    const third = sight({ description: 'Не спрашивали.' })
    vi.mocked(getVisionModels).mockResolvedValue(chain([first, second, third]))
    vi.mocked(semanticSearch).mockResolvedValue(found('prague-skyline-hostel'))
    const body = await (await withPhotos('найди похожий')).json()
    expect(body.photo).toMatchObject({ action: 'similar', seen: 'Номер с видом на море.' })
    expect(body.steps).toEqual([
      { agent: 'vision', title: 'Модель фото не ответила, смотрю другой', status: 'done', result: 'посмотрел' },
      expect.objectContaining({ agent: 'search' }),
    ])
    expect(third.doGenerateCalls).toHaveLength(0)
    // The second model gets the request of the first: the same photos, the same words.
    expect(second.doGenerateCalls[0].prompt).toEqual(first.doGenerateCalls[0].prompt)
  })

  it('takes an answer not in Russian as a failure and asks the next model', async () => {
    setModel(undefined)
    const english = sight({ description: 'A room with a view.' })
    vi.mocked(getVisionModels).mockResolvedValue(chain([english, sight({ description: 'Тихий двор с садом.' })]))
    const body = await (await withPhotos('найди похожий')).json()
    expect(body.photo).toMatchObject({ action: 'similar', seen: 'Тихий двор с садом.' })
  })

  it('answers the words without the photos when no model sees them (Scenario: Провайдер не ответил)', async () => {
    const text = new MockLanguageModelV4({ doGenerate: answer({ vibe: 'sea' }) })
    setModel(text)
    vi.mocked(getVisionModels).mockResolvedValue(
      chain([failing('500 Internal Server Error'), httpError(429), failing('504 Gateway Timeout')]),
    )
    const body = await post({
      messages: [
        { role: 'user', text: 'Хочу в Валенсию' },
        { role: 'assistant', text: 'Когда поедете?' },
        { role: 'user', text: 'хочу на море, найди похожий' },
      ],
      brief: { destinationId: 'valencia' },
      photos: [photo],
    }).then((r) => r.json())
    expect(body).toMatchObject({ brief: { destinationId: 'valencia', vibe: 'sea' }, source: 'model' })
    expect(body.photo).toEqual({ action: 'skipped' })
    expect(body.steps).toEqual([
      {
        agent: 'vision',
        title: 'Модель фото не ответила, смотрю другой',
        status: 'failed',
        result: 'ни одна модель не ответила',
      },
    ])
    // The text model reads the whole chat, as without photos.
    expect(text.doGenerateCalls[0].prompt.filter((m) => m.role !== 'system')).toHaveLength(3)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('504 Gateway Timeout'))
  })

  it('says the photos went unseen when no model sees them and the message has no words', async () => {
    setModel(undefined)
    vi.mocked(getVisionModels).mockResolvedValue(chain([failing('500'), failing('500'), failing('500')]))
    const body = await (await withPhotos('Найти похожие отели')).json()
    expect(body).toMatchObject({ brief: {}, source: 'rules', photo: { action: 'unseen' } })
  })

  it('says the limit is over only when every model that sees photos answered 429 (Scenario: Лимит запросов к модели фото)', async () => {
    setModel(undefined)
    vi.mocked(getVisionModels).mockResolvedValue(chain([httpError(429), httpError(429), httpError(429)]))
    expect(await (await withPhotos('найди похожий')).json()).toEqual({
      brief: {},
      source: 'rules',
      photo: { action: 'limited' },
    })
  })

  it('starts the next photos with the main model again (Scenario: Снова с основной)', async () => {
    setModel(undefined)
    const main = new MockLanguageModelV4({
      doGenerate: vi
        .fn()
        .mockRejectedValueOnce(new Error('500'))
        .mockResolvedValue(answer({ description: 'Бассейн на крыше.', features: [], view: null, place: null })),
    })
    const spare = sight({ description: 'Номер с балконом.' })
    vi.mocked(getVisionModels).mockResolvedValue(chain([main, spare]))
    expect((await (await withPhotos('найди похожий')).json()).photo.seen).toBe('Номер с балконом.')
    expect((await (await withPhotos('найди похожий')).json()).photo.seen).toBe('Бассейн на крыше.')
    expect(main.doGenerateCalls).toHaveLength(2)
    expect(spare.doGenerateCalls).toHaveLength(1)
  })

  it('keeps the models that see photos within the answer’s time', async () => {
    setModel(undefined)
    const times: number[] = []
    const real = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      times.push(ms)
      return real(ms)
    })
    // Each model stalls for the whole time the chain gives it (the time before seePhotos' own cap of 12 s).
    const stalls = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          vi.setSystemTime(Date.now() + times.at(-2)!)
          throw new DOMException('The operation timed out.', 'TimeoutError')
        },
      })
    const models = [stalls(), stalls(), stalls()]
    vi.mocked(getVisionModels).mockResolvedValue(chain(models, 10_000))
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const body = await (await withPhotos('Найти похожие отели')).json()
    const spent = Date.now() - start
    vi.useRealTimers()
    expect(body.photo).toEqual({ action: 'unseen' })
    // 10 s for the first, the 8 s left of the 18 s for the second, no time for the third.
    expect(models.map((m) => m.doGenerateCalls.length)).toEqual([1, 1, 0])
    expect(spent).toBe(18_000)
  })

  it('brings the status and the short answer of an API error to the log, not the request', async () => {
    setModel(undefined)
    vi.mocked(getVisionModels).mockResolvedValue(
      chain([
        new MockLanguageModelV4({
          doGenerate: async () => {
            throw new APICallError({
              message: '',
              url: 'https://integrate.api.nvidia.com/v1/chat/completions',
              requestBodyValues: { messages: ['secret photo'] },
              statusCode: 429,
              responseBody: `{"detail":"Too many requests ${'x'.repeat(400)}"}`,
            })
          },
        }),
      ]),
    )
    await withPhotos('найди похожий')
    const line = vi.mocked(console.warn).mock.calls.find((call) => String(call[0]).includes('HTTP 429'))![0] as string
    expect(line).toContain('HTTP 429: {"detail":"Too many requests')
    expect(line).not.toContain('secret photo')
    expect(line.length).toBeLessThan(400)
  })

  it('has a limit of its own for the model that sees photos', async () => {
    setModel(undefined)
    sees({ description: 'Бассейн.' })
    const answers = []
    // The address has looked at 19 photos this minute: the 20th still passes, the 21st does not.
    for (let i = 0; i < 19; i++) await allowVisionRequest('10.9.9.9')
    for (let i = 0; i < 2; i++)
      answers.push((await (await withPhotos('найди похожий', [photo], {}, '10.9.9.9')).json()).photo)
    expect(answers[0].action).toBe('similar')
    expect(answers[1]).toEqual({ action: 'limited' })
  })

  it('takes at most four optimised photos', async () => {
    setModel(undefined)
    expect((await withPhotos('найди похожий', Array(5).fill(photo))).status).toBe(400)
    expect((await withPhotos('найди похожий', ['data:image/svg+xml;base64,AAAA'])).status).toBe(400)
    expect((await withPhotos('найди похожий', ['https://example.com/a.webp'])).status).toBe(400)
    expect((await withPhotos('найди похожий', [`data:image/webp;base64,${'A'.repeat(1_500_000)}`])).status).toBe(400)
  })
})
