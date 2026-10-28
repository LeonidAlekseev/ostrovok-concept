import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setProduction } from '@/test/env'
import { getSecret } from '../secrets'
import { embedPhotos } from './photoEmbedding'
import { searchHotelsByPhotos } from './photoSearch'

const rpc = vi.fn()
const hidden = vi.hoisted(() => ({ ids: new Set<string>() }))

vi.mock('@/lib/db/catalog', () => ({ loadHiddenHotelIds: async () => hidden.ids }))
vi.mock('../secrets', () => ({ getSecret: vi.fn() }))
vi.mock('@/lib/env', () => import('@/test/env'))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://db.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) }),
}))
vi.mock('./photoEmbedding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photoEmbedding')>()),
  embedPhotos: vi.fn(),
}))

const photo = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4'
const rows = (...hotels: [string, number][]) => ({
  data: hotels.map(([hotel_id, similarity]) => ({ hotel_id, destination_id: 'valencia', similarity })),
  error: null,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(getSecret).mockResolvedValue('test-key')
  vi.mocked(embedPhotos).mockResolvedValue([[0.1, 0.2]])
  rpc.mockResolvedValue(rows(['ota-1', 0.8], ['ota-2', 0.6]))
})
afterEach(() => {
  setProduction(false)
  hidden.ids = new Set()
})

describe('searchHotelsByPhotos', () => {
  it('asks Valencia’s photo vectors and gives the hotels, best first', async () => {
    expect(await searchHotelsByPhotos([photo], { k: 5 })).toEqual({
      status: 'found',
      hits: [
        { id: 'ota-1', destinationId: 'valencia', score: 0.8 },
        { id: 'ota-2', destinationId: 'valencia', score: 0.6 },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('match_hotel_photos', {
      query_embedding: '[0.1,0.2]',
      destination_ids: ['valencia'],
      match_count: 12,
    })
    expect(embedPhotos).toHaveBeenCalledWith('test-key', [photo], expect.anything())
  })

  it('takes the nearest photo of each hotel among all the traveller’s photos, and cuts to k', async () => {
    vi.mocked(embedPhotos).mockResolvedValue([[1], [2]])
    rpc
      .mockResolvedValueOnce(rows(['ota-1', 0.5], ['ota-2', 0.7]))
      .mockResolvedValueOnce(rows(['ota-1', 0.9], ['ota-3', 0.6]))
    const result = await searchHotelsByPhotos([photo, photo], { k: 2 })
    expect(result).toEqual({
      status: 'found',
      hits: [
        { id: 'ota-1', destinationId: 'valencia', score: 0.9 },
        { id: 'ota-2', destinationId: 'valencia', score: 0.7 },
      ],
    })
  })

  it('shows only hotels visible in this environment and not outside the noise maps', async () => {
    hidden.ids = new Set(['ota-2'])
    rpc.mockResolvedValue(rows(['ota-1', 0.8], ['ota-2', 0.7], ['valencia-synthetic', 0.6]))
    expect(await searchHotelsByPhotos([photo])).toMatchObject({ hits: [{ id: 'ota-1' }, { id: 'valencia-synthetic' }] })
  })

  it('tells nothing found from a failure', async () => {
    rpc.mockResolvedValue(rows())
    expect(await searchHotelsByPhotos([photo])).toEqual({ status: 'empty' })

    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await searchHotelsByPhotos([photo])).toEqual({ status: 'failed', reason: 'database' })

    vi.mocked(embedPhotos).mockRejectedValue(new Error('422'))
    expect(await searchHotelsByPhotos([photo])).toEqual({ status: 'failed', reason: 'model' })

    vi.mocked(getSecret).mockResolvedValue(undefined)
    expect(await searchHotelsByPhotos([photo])).toEqual({ status: 'failed', reason: 'no-key' })
  })

  it('reports the caller’s abort apart from a failure', async () => {
    vi.mocked(embedPhotos).mockRejectedValue(new Error('aborted'))
    const controller = new AbortController()
    controller.abort()
    expect(await searchHotelsByPhotos([photo], { signal: controller.signal })).toEqual({
      status: 'failed',
      reason: 'aborted',
    })
  })

  it('does not call the model for a file that is no photo (untrusted input)', async () => {
    for (const bad of [[], ['https://evil.example/a.jpg'], ['data:text/html;base64,PGI+'], [photo, 'x']]) {
      expect(await searchHotelsByPhotos(bad)).toEqual({ status: 'failed', reason: 'model' })
    }
    expect(embedPhotos).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
