import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../../data/destinations'
import { newHotels } from '../../lib/catalogGenerator'
import { useChats } from './useChats'

const supabase = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => supabase.client }))

beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === 650 ? 0 : ms === 3000 ? 10 : ms, ...args)) as typeof setTimeout)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50))
      return Response.json({ source: 'model', brief: { trips: true } })
    }),
  )
})

afterEach(() => {
  supabase.client = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// assistant-search, Requirement: Один ответ на сообщение. The turn waits for the chat's save only so long (3 s, cut
// to 10 ms here): a slower save is still in flight when the answer replaces the wait step.
describe('useChats: the saved steps of a turn', () => {
  it('leaves no pending step in the database when the answer comes while the first save is in flight', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const chatId = crypto.randomUUID()
    const row = {
      id: chatId,
      title: 'Мои поездки',
      brief: { trips: true },
      question: null,
      unread: false,
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.002Z',
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          status: 'done',
          text: 'Что у меня забронировано?',
          data: {},
          createdAt: '2026-10-25T10:00:00.000Z',
        },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          status: 'pending',
          text: '',
          data: {},
          createdAt: '2026-10-25T10:00:00.002Z',
        },
      ],
    }
    // The database's messages by id: an upsert adds, a delete removes. The first write is slow.
    const db = new Map<string, { role: string; status: string }>()
    let writes = 0
    const table = (name: string) => {
      const chain: Record<string, unknown> = {}
      let mode: 'read' | 'upsert' | 'delete' = 'read'
      let rows: { id: string; role: string; status: string }[] = []
      for (const method of ['select', 'order', 'limit', 'eq']) chain[method] = vi.fn(() => chain)
      chain.upsert = vi.fn((value: typeof rows | object) => {
        mode = 'upsert'
        rows = (Array.isArray(value) ? value : []) as typeof rows
        return chain
      })
      chain.delete = vi.fn(() => {
        mode = 'delete'
        return chain
      })
      chain.in = vi.fn((_column: string, ids: string[]) => {
        rows = ids.map((id) => ({ id, role: '', status: '' }))
        return chain
      })
      chain.then = (resolve: (value: unknown) => unknown) =>
        (async () => {
          if (name === 'assistant_messages' && mode === 'upsert') {
            if (writes++ === 0) await new Promise((r) => setTimeout(r, 120))
            for (const m of rows) db.set(m.id, m)
          }
          if (name === 'assistant_messages' && mode === 'delete') for (const m of rows) db.delete(m.id)
          return { data: name === 'assistant_chats' && mode === 'read' ? [row] : null, error: null }
        })().then(resolve)
      return chain
    }
    supabase.client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: userId, email: 'a@b.c' } } } }) },
      from: table,
      storage: { from: () => ({}) },
      realtime: { setAuth: async () => {} },
      channel: () => {
        const channel = { on: () => channel, subscribe: () => channel }
        return channel
      },
      removeChannel: async () => {},
    }
    const { result } = renderHook(() => useChats(destinations, newHotels, chatId))
    await waitFor(() =>
      expect(result.current.chats[0]?.messages.map((m) => m.role + m.status)).toEqual(['userdone', 'assistantdone']),
    )

    // Both saves done: nothing of the turn's wait step is left.
    await waitFor(() => expect(writes).toBeGreaterThanOrEqual(2))
    await new Promise((r) => setTimeout(r, 300))
    expect([...db.values()].filter((m) => m.role === 'agent' && m.status === 'pending')).toEqual([])
  }, 20_000)
})
