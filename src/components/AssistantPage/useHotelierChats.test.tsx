// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HotelierConversation } from '../../lib/hotelierChat'
import { useHotelierChats } from './useHotelierChats'

const remote = vi.hoisted(() => ({
  loadMyChats: vi.fn(),
  emit: undefined as undefined | (() => void),
  stop: vi.fn(),
}))
vi.mock('@/hooks/useStore', () => ({ useSession: () => ({ email: 'a@b.c' }) }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({}) }))
vi.mock('@/lib/assistantShare', () => ({ deleteChatShares: vi.fn() }))
vi.mock('@/lib/hotelierChatRemote', () => ({
  loadMyChats: remote.loadMyChats,
  hideMyChat: vi.fn(),
  followInbox: (_client: unknown, on: () => void) => {
    remote.emit = on
    return remote.stop
  },
}))

afterEach(cleanup)

const chat = (id: string): HotelierConversation =>
  ({ id, hotelId: 'ota-1', hotelName: 'Hotel', kind: 'user', status: 'open' }) as HotelierConversation

describe('useHotelierChats', () => {
  // hotelier-chat, Requirement: «Мои чаты»: список обновляется сам
  it('reads the list again when one of the traveller’s conversations changes, and stops following on unmount', async () => {
    remote.loadMyChats.mockResolvedValueOnce([chat('c1')]).mockResolvedValueOnce([chat('c1'), chat('c2')])
    const { result, unmount } = renderHook(() => useHotelierChats(null))
    await waitFor(() => expect(result.current.chats.map((c) => c.id)).toEqual(['c1']))

    act(() => remote.emit?.())
    await waitFor(() => expect(result.current.chats.map((c) => c.id)).toEqual(['c1', 'c2']))

    unmount()
    expect(remote.stop).toHaveBeenCalled()
  })
})
