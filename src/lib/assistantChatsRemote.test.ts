// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { newChat, type Chat, type ChatMessage } from './assistantChats'
import {
  PHOTO_BUCKET,
  dataUrlBlob,
  deleteRemotePhotos,
  downloadPhotos,
  moveGuestPhotos,
  photoPath,
  photoPaths,
  saveRemoteChat,
  signedPhotoUrls,
  uploadPhotos,
} from './assistantChatsRemote'

const userId = '11111111-1111-4111-8111-111111111111'
const webp = 'data:image/webp;base64,UklGRg=='
const jpeg = 'data:image/jpeg;base64,/9j/'

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'user',
  status: 'done',
  text: '',
  data: {},
  createdAt: '2026-10-25T10:00:00.000Z',
  ...extra,
})

/** A Storage of one bucket that records the calls; `fails` makes every call fail. */
function storage({ fails = false } = {}) {
  const error = fails ? { message: 'Bucket not found' } : null
  const bucket = {
    upload: vi.fn(async (path: string) => ({ data: fails ? null : { path }, error })),
    remove: vi.fn(async () => ({ data: [], error })),
    download: vi.fn(async () => ({ data: fails ? null : new Blob(['x'], { type: 'image/webp' }), error })),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: fails
        ? null
        : paths.map((path) => ({ path, signedUrl: `https://cdn.example/${path}?token=t`, error: null })),
      error,
    })),
  }
  const upsert = vi.fn(async () => ({ error: null }))
  return {
    bucket,
    upsert,
    client: { storage: { from: vi.fn(() => bucket) }, from: vi.fn(() => ({ upsert })) } as never,
  }
}

// assistant-search, Requirement: Хранение фото
describe('the photos in Storage', () => {
  it('uploads each photo to the owner’s folder of the chat and the message', async () => {
    const { client, bucket } = storage()
    const sent = message({
      data: {
        attachments: [
          { preview: webp, width: 1600, height: 900 },
          { width: 800, height: 600 },
        ],
      },
    })
    const chatId = crypto.randomUUID()
    const attachments = await uploadPhotos(client, userId, chatId, sent, [webp, jpeg])
    expect(attachments).toEqual([
      { preview: webp, width: 1600, height: 900, path: `${userId}/${chatId}/${sent.id}/0.webp` },
      { width: 800, height: 600, path: `${userId}/${chatId}/${sent.id}/1.jpg` },
    ])
    expect(bucket.upload).toHaveBeenCalledWith(
      `${userId}/${chatId}/${sent.id}/0.webp`,
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/webp', upsert: true }),
    )
  })

  it('throws while the bucket is missing (the migration is not applied yet)', async () => {
    const { client } = storage({ fails: true })
    const sent = message({ data: { attachments: [{ preview: webp, width: 1, height: 1 }] } })
    await expect(uploadPhotos(client, userId, 'c', sent, [webp])).rejects.toThrow('Bucket not found')
  })

  it('writes a photo in Storage without its preview, one that is not there with it', async () => {
    const { client, upsert } = storage()
    const path = photoPath(userId, 'c', 'm', 0, 'image/webp')
    const chat: Chat = {
      ...newChat(),
      messages: [
        message({
          data: {
            attachments: [
              { path, preview: webp, width: 1, height: 1 },
              { preview: webp, width: 2, height: 2 },
            ],
          },
        }),
      ],
    }
    await saveRemoteChat(client, chat)
    const [rows] = upsert.mock.calls[1] as unknown as [{ data: ChatMessage['data'] }[]]
    expect(rows[0].data.attachments).toEqual([
      { path, width: 1, height: 1 },
      { preview: webp, width: 2, height: 2 },
    ])
  })

  it('gives signed links by path, downloads the photos again and deletes them', async () => {
    const { client, bucket } = storage()
    const urls = await signedPhotoUrls(client, ['a/b/c/0.webp'])
    expect(urls.get('a/b/c/0.webp')).toBe('https://cdn.example/a/b/c/0.webp?token=t')
    expect(await signedPhotoUrls(client, [])).toEqual(new Map())
    expect(await downloadPhotos(client, ['a/b/c/0.webp'])).toEqual([expect.stringMatching(/^data:image\/webp;base64,/)])
    await deleteRemotePhotos(client, ['a/b/c/0.webp'])
    expect(bucket.remove).toHaveBeenCalledWith(['a/b/c/0.webp'])
    expect(vi.mocked((client as { storage: { from: (b: string) => unknown } }).storage.from)).toHaveBeenCalledWith(
      PHOTO_BUCKET,
    )
  })

  it('lists the paths of a chat’s photos', () => {
    const chat: Chat = {
      ...newChat(),
      messages: [
        message({
          data: {
            attachments: [
              { path: 'p/0.webp', width: 1, height: 1 },
              { width: 1, height: 1 },
            ],
          },
        }),
      ],
    }
    expect(photoPaths(chat)).toEqual(['p/0.webp'])
  })

  it('decodes a data URL into its file', async () => {
    const blob = dataUrlBlob('data:image/webp;base64,AQID')
    expect(blob.type).toBe('image/webp')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3])
  })
})

// assistant-search, Requirement: Фото у гостя
describe('a guest’s photos on sign-in', () => {
  it('upload the previews with the chat', async () => {
    const { client } = storage()
    const sent = message({ data: { attachments: [{ preview: webp, width: 320, height: 240 }] } })
    const chat: Chat = { ...newChat(), messages: [sent, message({ role: 'assistant', text: 'Записал' })] }
    const moved = await moveGuestPhotos(client, userId, chat)
    expect(moved.messages[0].data.attachments).toEqual([
      { preview: webp, width: 320, height: 240, path: `${userId}/${chat.id}/${sent.id}/0.webp` },
    ])
    expect(moved.messages[1]).toBe(chat.messages[1])
  })

  it('keep the preview when the upload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = storage({ fails: true })
    const chat: Chat = {
      ...newChat(),
      messages: [message({ data: { attachments: [{ preview: webp, width: 320, height: 240 }] } })],
    }
    const moved = await moveGuestPhotos(client, userId, chat)
    expect(moved.messages[0].data.attachments).toEqual([{ preview: webp, width: 320, height: 240 }])
    warn.mockRestore()
  })
})
