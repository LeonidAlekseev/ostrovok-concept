import { beforeEach, describe, expect, it, vi } from 'vitest'

type Answer = { data: unknown; error: unknown }
type Call = { table: string; ops: string[]; value?: unknown; filters: unknown[][] }

const mocks = vi.hoisted(() => ({
  answers: {} as Record<string, Answer[]>,
  calls: [] as Call[],
  extract: vi.fn(async (): Promise<unknown> => null),
}))

vi.mock('server-only', () => ({}))
vi.mock('../supabase/config', () => ({ isSupabaseConfigured: true, supabaseUrl: 'https://db.test' }))
vi.mock('../secrets', () => ({ getSecret: async () => 'service-key' }))
vi.mock('../ai/model', () => ({ getTextModels: async () => [] }))
vi.mock('../ai/hotelierExtract', () => ({ extractHotelierFacts: mocks.extract }))
vi.mock('@supabase/supabase-js', () => ({
  // Each read or write of a table is answered in order by `answers['<table>:<last operation>']`.
  createClient: () => ({
    from: (table: string) => {
      const call: Call = { table, ops: [], filters: [] }
      mocks.calls.push(call)
      const answer = () => mocks.answers[`${table}:${call.ops.at(-1)}`]?.shift() ?? { data: [], error: null }
      const query: Record<string, unknown> = {
        then: (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(resolve, reject),
      }
      for (const op of ['select', 'update', 'eq', 'lte', 'order', 'limit', 'maybeSingle', 'single', 'is', 'in'])
        query[op] = (...args: unknown[]) => {
          call.ops.push(op)
          if (op === 'update') call.value = args[0]
          if (op === 'eq' || op === 'lte') call.filters.push([op, ...args])
          return query
        }
      return query
    },
  }),
}))

const { MAX_KNOWLEDGE_ATTEMPTS, processHotelierAnswer, retryDelayMs, retryDueHotelierKnowledge } =
  await import('./hotelierKnowledge')

const MESSAGE = 'm1'
const past = () => new Date(Date.now() - 1000).toISOString()
const future = () => new Date(Date.now() + 60_000).toISOString()

/** The answer the extraction reads: a shareable answer of the demo-less hotelier to the request r1. */
function answerRead() {
  mocks.answers['hotelier_messages:maybeSingle'].push({
    data: { id: MESSAGE, sender: 'hotelier', shareable: true, text: 'Да', conversation_id: 'c1', request_id: 'r1' },
    error: null,
  })
  mocks.answers['hotelier_conversations:single'] = [{ data: { hotel_id: 'ota-1' }, error: null }]
  mocks.answers['hotels:single'] = [{ data: { id: 'ota-1', name: 'Hotel' }, error: null }]
  mocks.answers['hotelier_requests:maybeSingle'] = [{ data: { id: 'r1', question: 'Балкон?' }, error: null }]
}

/** The message's state as the claim reads it, and whether the claim's write wins. */
function due(attempts: number, dueAt: string | null, wins = true) {
  mocks.answers['hotelier_messages:maybeSingle'] = [
    { data: { knowledge_attempts: attempts, knowledge_due_at: dueAt }, error: null },
  ]
  mocks.answers['hotelier_messages:select'] = [{ data: wins ? [{ id: MESSAGE }] : [], error: null }]
}

const updates = (table: string) => mocks.calls.filter((c) => c.table === table && c.ops.includes('update'))

beforeEach(() => {
  mocks.answers = {}
  mocks.calls = []
  mocks.extract.mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('the retry of an answer’s knowledge', () => {
  it('waits 1, 4, 16 and 64 minutes between the tries', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 240_000, 960_000, 3_840_000])
  })

  it('takes nothing that is not due yet, or that another worker took first', async () => {
    due(0, future())
    expect(await processHotelierAnswer(MESSAGE)).toBe('skipped')
    due(0, null)
    expect(await processHotelierAnswer(MESSAGE)).toBe('skipped')
    due(0, past(), false)
    expect(await processHotelierAnswer(MESSAGE)).toBe('skipped')
    expect(mocks.extract).not.toHaveBeenCalled()
  })

  it('takes a due answer for a lease, compared by its tries, before the model reads it', async () => {
    due(1, past())
    answerRead()
    await processHotelierAnswer(MESSAGE)
    const [claim] = updates('hotelier_messages')
    expect(claim.value).toMatchObject({ knowledge_attempts: 2 })
    expect(Date.parse((claim.value as { knowledge_due_at: string }).knowledge_due_at)).toBeGreaterThan(
      Date.now() + 9 * 60_000,
    )
    expect(claim.filters).toContainEqual(['eq', 'knowledge_attempts', 1])
    expect(mocks.extract).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed try due again after its pause, the request still on its way', async () => {
    due(0, past())
    answerRead()
    expect(await processHotelierAnswer(MESSAGE)).toBe('failed')
    const retry = updates('hotelier_messages').at(-1)!
    const at = Date.parse((retry.value as { knowledge_due_at: string }).knowledge_due_at)
    expect(at).toBeGreaterThan(Date.now() + 50_000)
    expect(at).toBeLessThan(Date.now() + 70_000)
    expect(updates('hotelier_requests')).toEqual([])
  })

  it('after the last try fails the request and stops its runs waiting; the operator may still force it', async () => {
    due(MAX_KNOWLEDGE_ATTEMPTS - 1, past())
    answerRead()
    mocks.answers['tool_runs:eq'] = [{ data: [], error: null }]
    expect(await processHotelierAnswer(MESSAGE)).toBe('failed')
    expect(updates('hotelier_messages').at(-1)!.value).toEqual({ knowledge_due_at: null })
    expect(updates('hotelier_requests').map((c) => c.value)).toEqual([{ knowledge_status: 'failed' }])
    expect(mocks.calls.some((c) => c.table === 'tool_runs')).toBe(true)

    mocks.calls = []
    due(MAX_KNOWLEDGE_ATTEMPTS, null)
    answerRead()
    await processHotelierAnswer(MESSAGE, { force: true })
    expect(mocks.extract).toHaveBeenCalledTimes(2)
  })

  it('looks for due answers at most once a minute', async () => {
    mocks.answers['hotelier_messages:limit'] = [{ data: [], error: null }]
    expect(await retryDueHotelierKnowledge()).toBe(0)
    const read = mocks.calls.find((c) => c.table === 'hotelier_messages')!
    expect(read.filters[0]?.[1]).toBe('knowledge_due_at')
    mocks.calls = []
    await retryDueHotelierKnowledge()
    expect(mocks.calls).toEqual([])
  })
})
