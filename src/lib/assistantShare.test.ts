import { describe, expect, it, vi } from 'vitest'
import { storageBucket } from '@/test/storageBucket'
import { newChat, type Chat, type ChatMessage } from './assistantChats'
import {
  SHARED_PHOTO_BUCKET,
  SHARE_ERROR,
  UNSHARE_ERROR,
  deleteShare,
  isShareId,
  loadSharedChat,
  parseSnapshot,
  shareChat,
  shareHref,
  snapshotOf,
  type ShareSnapshot,
} from './assistantShare'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const message = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  status: 'done',
  text,
  data: {},
  createdAt: '2026-10-24T10:00:00.000Z',
  ...extra,
})

const chat: Chat = {
  ...newChat('2026-10-24T10:00:00.000Z'),
  title: 'Тихий отель',
  brief: { destinationId: 'valencia', quiet: true },
  messages: [
    message('user', 'Тихий отель в Валенсии'),
    message('assistant', 'Записал: Валенсия.'),
    message('user', 'а повыше?'),
    message('assistant', '', { status: 'pending' }),
  ],
}

/** A Supabase client of one answer for `from(...).insert().select().single()` and `rpc()`. */
const client = (answer: { data: unknown; error: { message: string } | null }) => {
  const single = vi.fn(async () => answer)
  const insert = vi.fn(() => ({ select: () => ({ single }) }))
  return {
    from: vi.fn(() => ({ insert })),
    rpc: vi.fn(async () => answer),
    insert,
  }
}

// assistant-search, Requirement: Поделиться чатом
describe('a shared chat', () => {
  it('is the chat without what is still on its way', () => {
    const snapshot = snapshotOf(chat)
    expect(snapshot.title).toBe('Тихий отель')
    expect(snapshot.messages.map((m) => m.text)).toEqual(['Тихий отель в Валенсии', 'Записал: Валенсия.', 'а повыше?'])
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(parseSnapshot({ title: 1 })).toBeNull()
    expect(snapshotOf({ ...chat, title: '' }).title).toBe('Тихий отель в Валенсии')
  })

  it('saves the snapshot and gives the id of the link', async () => {
    const id = '0b0c7a1e-6f2b-4b5e-9a37-0c6f1b2d3e4f'
    const c = client({ data: { id }, error: null })
    expect(await shareChat(c as never, chat)).toBe(id)
    expect(c.from).toHaveBeenCalledWith('assistant_chat_shares')
    // The id of the snapshot is made in the browser: its photos are copied under it first.
    expect(c.insert).toHaveBeenCalledWith({
      id: expect.stringMatching(UUID),
      title: 'Тихий отель',
      snapshot: snapshotOf(chat),
    })
    expect(shareHref(id)).toBe(`/assistant/shared/${id}`)
  })

  // assistant-search, Requirement: Хранение фото
  it('copies the photos to the public bucket under the snapshot’s id (Scenario: Снимок по ссылке)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const path = `${userId}/${chat.id}/22222222-2222-4222-8222-222222222222/0.webp`
    const withPhotos: Chat = {
      ...chat,
      messages: [
        message('user', '', { data: { attachments: [{ path, width: 1600, height: 1200 }] } }),
        message('user', '', {
          data: { attachments: [{ preview: 'data:image/webp;base64,AAAA', width: 320, height: 240 }] },
        }),
        ...chat.messages,
      ],
    }
    const copy = vi.fn(async () => ({ data: { path: 'x' }, error: null }))
    const getPublicUrl = vi.fn((to: string) => ({ data: { publicUrl: `https://cdn.example/${to}` } }))
    const c = {
      ...client({ data: { id: 'ignored' }, error: null }),
      auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
      storage: { from: vi.fn(() => ({ copy, getPublicUrl })) },
    }
    await shareChat(c as never, withPhotos)
    const [{ id, snapshot }] = c.insert.mock.calls[0] as unknown as [{ id: string; snapshot: ShareSnapshot }]
    expect(copy).toHaveBeenCalledWith(path, `${userId}/${id}/0.webp`, { destinationBucket: SHARED_PHOTO_BUCKET })
    expect(c.storage.from).toHaveBeenCalledWith('assistant-attachments')
    expect(snapshot.messages[0].data.attachments).toEqual([
      { width: 1600, height: 1200, url: `https://cdn.example/${userId}/${id}/0.webp` },
    ])
    // A preview that never reached Storage stays as it is.
    expect(snapshot.messages[1].data.attachments).toEqual([
      { width: 320, height: 240, preview: 'data:image/webp;base64,AAAA' },
    ])
  })

  it('keeps a photo that was not copied as «Фото»', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const userId = '11111111-1111-4111-8111-111111111111'
    const path = `${userId}/${chat.id}/22222222-2222-4222-8222-222222222222/0.webp`
    const c = {
      ...client({ data: { id: 'x' }, error: null }),
      auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
      storage: { from: () => ({ copy: async () => ({ data: null, error: { message: 'Bucket not found' } }) }) },
    }
    await shareChat(c as never, {
      ...chat,
      messages: [message('user', 'вот', { data: { attachments: [{ path, width: 8, height: 6 }] } })],
    })
    const [{ snapshot }] = c.insert.mock.calls[0] as unknown as [{ snapshot: ShareSnapshot }]
    expect(snapshot.messages[0].data.attachments).toEqual([{ width: 8, height: 6 }])
    warn.mockRestore()
  })

  it('fails with a plain message while the table is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = client({ data: null, error: { message: 'relation "assistant_chat_shares" does not exist' } })
    await expect(shareChat(c as never, chat)).rejects.toThrow(SHARE_ERROR)
    warn.mockRestore()
  })

  it('removes the copied photos when the snapshot is not saved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const userId = '11111111-1111-4111-8111-111111111111'
    const path = `${userId}/${chat.id}/22222222-2222-4222-8222-222222222222/0.webp`
    const shared = storageBucket()
    const c = {
      ...client({ data: null, error: { message: 'new row violates check constraint' } }),
      auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
      storage: {
        from: (bucket: string) =>
          bucket === SHARED_PHOTO_BUCKET
            ? { ...shared, getPublicUrl: (to: string) => ({ data: { publicUrl: `https://cdn.example/${to}` } }) }
            : {
                copy: async (_: string, to: string) => {
                  shared.stored.set(to, '2026-10-26T12:00:00.000Z')
                  return { data: { path: to }, error: null }
                },
              },
      },
    }
    await expect(
      shareChat(c as never, {
        ...chat,
        messages: [message('user', 'вот', { data: { attachments: [{ path, width: 8, height: 6 }] } })],
      }),
    ).rejects.toThrow(SHARE_ERROR)
    expect(shared.remove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^${userId}/[0-9a-f-]{36}/0\\.webp$`)),
    ])
    expect(shared.stored.size).toBe(0)
    warn.mockRestore()
  })

  it('reads a snapshot by its id; a malformed id is not asked for (Scenario: Просмотр по ссылке)', async () => {
    const id = '0b0c7a1e-6f2b-4b5e-9a37-0c6f1b2d3e4f'
    const row = { id, title: 'Тихий отель', snapshot: snapshotOf(chat), created_at: '2026-10-24T11:00:00.000Z' }
    const c = client({ data: [row], error: null })
    expect(await loadSharedChat(c as never, id)).toMatchObject({ id, title: 'Тихий отель', createdAt: row.created_at })
    expect(c.rpc).toHaveBeenCalledWith('assistant_chat_share', { share_id: id })

    const none = client({ data: [], error: null })
    expect(await loadSharedChat(none as never, id)).toBeNull()
    expect(await loadSharedChat(none as never, 'not-an-id')).toBeNull()
    expect(isShareId('not-an-id')).toBe(false)
    expect(none.rpc).toHaveBeenCalledTimes(1)
  })
})

// assistant-search, Requirement: Лимит фото
describe('deleting a shared chat', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const id = '0b0c7a1e-6f2b-4b5e-9a37-0c6f1b2d3e4f'
  const kept = '33333333-3333-4333-8333-333333333333'
  const left = '44444444-4444-4444-8444-444444444444'

  /** The user's snapshots in the table and their photos in the public bucket. */
  function owner({ deleteError = null as { message: string } | null } = {}) {
    const rows = new Set([id, kept])
    const shared = storageBucket({
      [`${userId}/${id}/0.webp`]: '2026-10-26T11:59:00.000Z',
      [`${userId}/${id}/1.jpg`]: '2026-10-26T11:59:00.000Z',
      [`${userId}/${kept}/0.webp`]: '2026-10-20T10:00:00.000Z',
      // A snapshot deleted by hand long ago: its photos stayed.
      [`${userId}/${left}/0.webp`]: '2026-10-20T10:00:00.000Z',
    })
    const eq = vi.fn(async (_: string, value: string) => {
      if (!deleteError) rows.delete(value)
      return { error: deleteError }
    })
    const c = {
      from: vi.fn(() => ({
        delete: () => ({ eq }),
        select: async () => ({ data: [...rows].map((r) => ({ id: r })), error: null }),
      })),
      auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
      storage: { from: vi.fn(() => shared) },
    }
    return { c, eq, rows, shared }
  }

  it('deletes its photos and the ones left by the snapshots deleted before (Scenario: Удаление снимка)', async () => {
    const { c, eq, rows, shared } = owner()
    await deleteShare(c as never, id)
    expect(c.from).toHaveBeenCalledWith('assistant_chat_shares')
    expect(eq).toHaveBeenCalledWith('id', id)
    expect([...rows]).toEqual([kept])
    expect(c.storage.from).toHaveBeenCalledWith(SHARED_PHOTO_BUCKET)
    expect([...shared.stored.keys()]).toEqual([`${userId}/${kept}/0.webp`])
  })

  it('keeps the photos when the snapshot is not deleted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { c, shared } = owner({ deleteError: { message: 'permission denied' } })
    await expect(deleteShare(c as never, id)).rejects.toThrow(UNSHARE_ERROR)
    expect(shared.stored.size).toBe(4)
    expect(shared.remove).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not ask for a malformed id', async () => {
    const { c } = owner()
    await deleteShare(c as never, 'not-an-id')
    expect(c.from).not.toHaveBeenCalled()
  })
})
