import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../../data/destinations'
import { newHotels } from '../../lib/catalogGenerator'
import { compose, useChats } from './useChats'

const fetchMock = vi.fn<typeof fetch>()
const answer = () => Response.json({ source: 'model', brief: { vibe: 'sea' } })

beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === 650 ? 0 : ms, ...args)) as typeof setTimeout)
  fetchMock.mockImplementation(async () => answer())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  window.localStorage.clear()
})

const ready = async (id: string | null) => {
  const hook = renderHook(({ id }) => useChats(destinations, newHotels, id), {
    initialProps: { id },
  })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  return hook
}

// assistant-search, Requirement: Один ответ на сообщение
describe('useChats: one answer per message', () => {
  it('turns two sends of one tick into one message, one request and one answer', async () => {
    const { result } = await ready(null)

    act(() => {
      result.current.send('к морю')
      result.current.send('к морю')
    })

    await waitFor(() => expect(result.current.chats[0].messages.at(-1)?.status).toBe('done'))
    await new Promise((r) => setTimeout(r, 30))
    const messages = result.current.chats[0].messages
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not ask again when the turn effect runs again after the answer', async () => {
    const { result, rerender } = await ready(null)
    act(() => result.current.send('к морю'))
    await waitFor(() => expect(result.current.chats[0].messages.at(-1)?.status).toBe('done'))
    const chatId = result.current.chats[0].id

    // A new identity of the turn (the hook's inputs change) runs the effect once more.
    rerender({ id: chatId })
    rerender({ id: null })
    await new Promise((r) => setTimeout(r, 30))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.chats[0].messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
  })
})

// assistant-search, Requirement: Память сессии
describe('compose: the text does not repeat what the memory card shows', () => {
  const valencia = destinations.find((d) => d.name === 'Валенсия')!

  it('has no «Записал» in the question, the plan or the remark', () => {
    const brief = { destinationId: valencia.id, vibe: 'sea' as const }
    const asked = compose({ source: 'model', brief }, destinations, newHotels, undefined, {})
    expect(asked.text).not.toContain('Записал')
    const remarked = compose({ source: 'model', brief: {}, reply: 'Привет!' }, destinations, newHotels, undefined, {})
    expect(remarked.text).toContain('Привет!')
    expect(remarked.text).not.toContain('Записал')
    const same = compose({ source: 'model', brief }, destinations, newHotels, undefined, brief)
    expect(same.text).not.toContain('Записал')
  })
})
