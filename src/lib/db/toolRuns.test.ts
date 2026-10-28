import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { errorResult } from '@/lib/toolResult'
import { sampleResult } from '@/test/toolResult'
import { recordRun, runOwner, type RunOwner } from './toolRuns'

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => null }))

type Call = { table: string; op: string; value?: unknown; filters: unknown[][] }

/**
 * A client of the user's session: what it writes, by table, in order; `fail` makes a table's writes fail with a code.
 * `chats` are the chats RLS shows the user.
 */
function session({
  userId = 'user-a',
  chats = ['chat-a'],
  fail = {} as Record<string, string>,
}: { userId?: string | null; chats?: string[]; fail?: Record<string, string> } = {}) {
  const calls: Call[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from: (table: string) => {
      const call: Call = { table, op: '', filters: [] }
      const answer = () =>
        fail[table]
          ? { data: null, error: { code: fail[table], message: 'row of the user: «секрет»' } }
          : {
              data:
                call.op === 'select'
                  ? chats.includes(call.filters.find(([k]) => k === 'id')?.[1] as string)
                    ? { id: 'chat-a' }
                    : null
                  : null,
              error: null,
            }
      const query = {
        select: () => ((call.op = 'select'), calls.push(call), query),
        insert: (value: unknown) => ((call.op = 'insert'), (call.value = value), calls.push(call), query),
        update: (value: unknown) => ((call.op = 'update'), (call.value = value), calls.push(call), query),
        eq: (key: string, value: unknown) => (call.filters.push([key, value]), query),
        maybeSingle: async () => answer(),
        then: (resolve: (value: unknown) => unknown) => resolve(answer()),
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

const ownerOf = (client: SupabaseClient<Database>): RunOwner => ({
  client,
  userId: 'user-a',
  chatId: 'chat-a',
  messageId: 'message-a',
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// assistant-search, Requirement: Запуски инструментов в базе
describe('the runs of the tools', () => {
  it('writes the row running before the tool works, then its end and its sources', async () => {
    const { client, calls } = session()
    let before: Call[] = []
    const run = await recordRun(ownerOf(client), 'noise_analysis', 'Отель (ota-9096882)', async () => {
      before = [...calls]
      return sampleResult
    })
    expect(before).toEqual([
      expect.objectContaining({
        table: 'tool_runs',
        op: 'insert',
        value: expect.objectContaining({
          id: run.id,
          chat_id: 'chat-a',
          user_id: 'user-a',
          message_id: 'message-a',
          tool_name: 'noise_analysis',
          status: 'running',
          input_summary: 'Отель (ota-9096882)',
        }),
      }),
    ])
    const update = calls.find((c) => c.op === 'update')!
    expect(update.filters).toEqual([['id', run.id]])
    expect(update.value).toMatchObject({
      status: 'success',
      result_summary: sampleResult.summary,
      result_data: sampleResult,
      error: null,
    })
    const { completed_at } = update.value as { completed_at: string }
    const { started_at } = calls[0].value as { started_at: string }
    expect(Date.parse(completed_at)).toBeGreaterThanOrEqual(Date.parse(started_at))
    expect(calls.at(-1)).toMatchObject({
      table: 'tool_run_evidence',
      value: sampleResult.evidence.map((e) => ({ tool_run_id: run.id, user_id: 'user-a', evidence_id: e.id })),
    })
    expect(run.result).toEqual(sampleResult)
  })

  // hotelier-knowledge, Requirement: Запрос отельеру
  it('gives the tool its run’s id, and leaves a pending run waiting with what resumes it', async () => {
    const { client, calls } = session()
    let given: string | null = null
    const pending = {
      ...sampleResult,
      status: 'pending' as const,
      data: { request_id: 'request-1' },
      evidence: [],
      claims: [],
      calculations: [],
    }
    const run = await recordRun(ownerOf(client), 'ask_hotelier', 'Отель', async (runId) => {
      given = runId
      return pending
    })
    expect(given).toBe(run.id)
    expect(calls.find((c) => c.op === 'update')?.value).toMatchObject({
      status: 'waiting',
      completed_at: null,
      resume: { request_id: 'request-1' },
      result_data: pending,
    })
    // A guest's run has no row, so no id to link.
    await recordRun(null, 'ask_hotelier', 'Отель', async (runId) => {
      given = runId
      return pending
    })
    expect(given).toBeNull()
  })

  it('keeps parallel runs apart: a row and an id each (Scenario: Параллельные вызовы)', async () => {
    const { client, calls } = session()
    const owner = ownerOf(client)
    const failing = errorResult('store_unavailable', 'Хранилище недоступно')
    const [a, b] = await Promise.all([
      recordRun(owner, 'noise_analysis', 'a', async () => sampleResult),
      recordRun(owner, 'noise_analysis', 'b', async () => failing),
    ])
    expect(a.id).not.toBe(b.id)
    const inserted = calls.filter((c) => c.op === 'insert' && c.table === 'tool_runs')
    expect(inserted.map((c) => (c.value as { id: string }).id).sort()).toEqual([a.id, b.id].sort())
    const updates = Object.fromEntries(
      calls.filter((c) => c.op === 'update').map((c) => [c.filters[0][1], (c.value as { status: string }).status]),
    )
    expect(updates).toEqual({ [a.id]: 'success', [b.id]: 'error' })
  })

  it('records a failed tool as an error with its message (Scenario: Ошибка инструмента)', async () => {
    const { client, calls } = session()
    const run = await recordRun(ownerOf(client), 'noise_analysis', '', async () => {
      throw new Error('boom')
    })
    expect(run.result).toMatchObject({ status: 'error', error: { code: 'tool_failed' }, evidence: [] })
    expect(calls.find((c) => c.op === 'update')!.value).toMatchObject({
      status: 'error',
      error: { code: 'tool_failed', message: 'Инструмент не сработал' },
    })
    // No source, nothing for tool_run_evidence.
    expect(calls.some((c) => c.table === 'tool_run_evidence')).toBe(false)
  })

  it('takes no output off the contract', async () => {
    const run = await recordRun(null, 'noise_analysis', '', async () => ({ ...sampleResult, status: 'ok' }) as never)
    expect(run.result).toMatchObject({ status: 'error', error: { code: 'invalid_result' } })
  })

  it('answers all the same when the row is not written, and logs no user data', async () => {
    const { client, calls } = session({ fail: { tool_runs: '42501' } })
    const run = await recordRun(ownerOf(client), 'noise_analysis', 'Отель', async () => sampleResult)
    expect(run.result).toEqual(sampleResult)
    // Not started: no end is written.
    expect(calls.filter((c) => c.op === 'update')).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('tool_runs: not started (42501)')
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('секрет')
  })

  it('writes nothing of a guest: the run lives in the answer', async () => {
    const run = await recordRun(null, 'noise_analysis', '', async () => sampleResult)
    expect(run).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), result: sampleResult })
  })
})

describe('the owner of the runs', () => {
  it('is the signed-in user whose chat it is', async () => {
    const { client, calls } = session()
    expect(await runOwner('chat-a', 'message-a', client)).toEqual({
      client,
      userId: 'user-a',
      chatId: 'chat-a',
      messageId: 'message-a',
    })
    // RLS shows only the user's chats; the row is asked by the user's id as well.
    expect(calls[0]).toMatchObject({
      table: 'assistant_chats',
      filters: [
        ['id', 'chat-a'],
        ['user_id', 'user-a'],
      ],
    })
  })

  it('is none for a guest, a chat not the user’s or not saved, no chat or no Supabase', async () => {
    expect(await runOwner('chat-a', undefined, session({ userId: null }).client)).toBeNull()
    expect(await runOwner('chat-b', undefined, session().client)).toBeNull()
    expect(await runOwner(undefined, undefined, session().client)).toBeNull()
    expect(await runOwner('chat-a', undefined)).toBeNull()
  })
})
