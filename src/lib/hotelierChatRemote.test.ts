import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './db/database.types'
import { followConversation } from './hotelierChatRemote'

type Handler = (payload: object) => void

/** A client whose channel records its bindings and the order of authorization, subscription and removal. */
function fake(token: string | null = 'user-token') {
  const order: string[] = []
  const handlers: Record<string, Handler> = {}
  const channel = {
    on: (_type: string, { table }: { table: string }, handler: Handler) => ((handlers[table] = handler), channel),
    subscribe: () => (order.push('subscribe'), channel),
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    realtime: { setAuth: async (t: string) => void order.push(`auth ${t}`) },
    channel: () => channel,
    removeChannel: async () => void order.push('remove'),
  }
  return { client: client as unknown as SupabaseClient<Database>, order, handlers }
}

const row = { id: 'm1', conversation_id: 'c1', sender: 'hotelier', text: 'Да', created_at: 't' }

describe('followConversation', () => {
  it('joins with the user’s token, not the anon key', async () => {
    const { client, order } = fake()
    followConversation(client, 'c1', { message: vi.fn(), conversation: vi.fn() })
    await vi.waitFor(() => expect(order).toEqual(['auth user-token', 'subscribe']))
  })

  it('never joins a channel removed before it was authorized', async () => {
    const { client, order } = fake()
    const stop = followConversation(client, 'c1', { message: vi.fn(), conversation: vi.fn() })
    stop()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(order).not.toContain('subscribe')
    expect(order).toContain('remove')
  })

  it('passes the rows on and drops the events the policies refused', () => {
    const { client, handlers } = fake()
    const message = vi.fn()
    const conversation = vi.fn()
    followConversation(client, 'c1', { message, conversation })
    handlers.hotelier_messages({ new: {}, errors: ['Error 401: Unauthorized'] })
    handlers.hotelier_conversations({ new: {}, errors: ['Error 401: Unauthorized'] })
    expect(message).not.toHaveBeenCalled()
    expect(conversation).not.toHaveBeenCalled()
    handlers.hotelier_messages({ new: row, errors: null })
    expect(message).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', sender: 'hotelier', text: 'Да' }))
  })
})
