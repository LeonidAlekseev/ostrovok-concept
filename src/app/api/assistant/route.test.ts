import type { LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAssistantModel } from '@/lib/ai/model'
import { POST } from './route'

vi.mock('@/lib/ai/model', () => ({ getAssistantModel: vi.fn() }))

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

function useModel(model: MockLanguageModelV4 | undefined) {
  vi.mocked(getAssistantModel).mockResolvedValue(model as LanguageModel | undefined)
}

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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// assistant-search, Requirement: Разбор пожелания
describe('POST /api/assistant', () => {
  it('reads the wish with the rules without a key (Scenario: Модель недоступна)', async () => {
    useModel(undefined)
    const response = await ask('Хочу на море в октябре, бюджет до 70 000 ₽')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ brief: { vibe: 'sea', when: 9, budget: 70000 }, source: 'rules' })
  })

  it('reads a free phrase with the model (Scenario: Свободная фраза)', async () => {
    const model = new MockLanguageModelV4({ doGenerate: answer({ vibe: 'sea', budget: 50000 }) })
    useModel(model)
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
    useModel(
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
    const { brief } = await (await ask('что-то')).json()
    expect(brief).toEqual({ when: 9, nights: 30, party: 'couple', budget: 70000 })
  })

  it('keeps a known catalog city', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: answer({ destinationId: 'prague', when: 'soon' }) }))
    expect((await (await ask('в Прагу поскорее')).json()).brief).toEqual({ destinationId: 'prague', when: 'soon' })
  })

  it('adds the answer to what is understood (Scenario: Уточнение темы)', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: answer({ vibe: 'weekend', when: 'soon', nights: 2 }) }))
    const { brief } = await (await ask('на выходные', { vibe: 'sea', budget: 70000 })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 'soon', nights: 2, budget: 70000 })
  })

  it('hands the asked question to the assistant (Scenario: Довериться ассистенту)', async () => {
    useModel(new MockLanguageModelV4({ doGenerate: answer({}) }))
    // The brief lacks the dates, so "не важно" answers "Когда планируете поехать?".
    const { brief } = await (await ask('не важно', { vibe: 'sea' })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 'any' })
  })

  it('falls back to the rules when the model fails', async () => {
    useModel(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('429 Rate limit exceeded')
        },
      }),
    )
    const response = await ask('Хочу на море в октябре, бюджет до 70 000 ₽')
    expect(await response.json()).toEqual({ brief: { vibe: 'sea', when: 9, budget: 70000 }, source: 'rules' })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('429 Rate limit exceeded'))
  })

  it('falls back to the rules when the answer is not JSON', async () => {
    useModel(
      new MockLanguageModelV4({
        doGenerate: { ...answer({}), content: [{ type: 'text', text: 'Конечно! Море — отличный выбор.' }] },
      }),
    )
    expect(await (await ask('в горы')).json()).toEqual({ brief: { vibe: 'mountains' }, source: 'rules' })
  })

  it('gives the model one attempt of 8 seconds, then the rules (Scenario: Модель недоступна)', async () => {
    const clock = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal)
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))
          clock.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        }),
    })
    useModel(model)
    const response = await ask('в горы')
    expect(timeout).toHaveBeenCalledWith(8000)
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(await response.json()).toEqual({ brief: { vibe: 'mountains' }, source: 'rules' })
  })

  it('cleans the brief sent by the client', async () => {
    useModel(undefined)
    const { brief } = await (await ask('вдвоём', { vibe: 'sea', when: 9, budget: -5, destinationId: 'x' })).json()
    expect(brief).toEqual({ vibe: 'sea', when: 9, party: 'couple' })
  })

  it('rejects long messages, long histories and broken bodies', async () => {
    useModel(undefined)
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
    useModel(undefined)
    const body = { messages: [{ role: 'user', text: 'море' }], brief: {} }
    for (let i = 0; i < 20; i++) expect((await post(body, '192.0.2.1')).status).toBe(200)
    expect((await post(body, '192.0.2.1')).status).toBe(429)
    expect((await post(body, '192.0.2.2')).status).toBe(200)
  })
})
