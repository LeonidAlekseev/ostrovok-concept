import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PHOTO_BATCH,
  PHOTO_EMBEDDING_DIMENSIONS,
  PHOTO_EMBEDDING_MODEL,
  embedPhotos,
  isPhotoDataUrl,
  photoContentHash,
  photoKey,
  photoUrl,
} from './photoEmbedding'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(
    async (..._args: Parameters<typeof globalThis.fetch>) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const vector = (head: number) => Array.from({ length: PHOTO_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? head : 0))

describe('photoKey', () => {
  const url = 'https://cdn.ostrovok.ru/t/{size}/content/0d/30/0d30ec5e.JPEG'

  it('is the CDN path without the host and the size, and gives back the photo at a size', () => {
    expect(photoKey(url)).toBe('content/0d/30/0d30ec5e.JPEG')
    expect(photoKey('https://cdn.ostrovok.ru/t/1024x768/content/0d/30/0d30ec5e.JPEG')).toBe(
      'content/0d/30/0d30ec5e.JPEG',
    )
    expect(photoUrl('content/0d/30/0d30ec5e.JPEG')).toBe(
      'https://cdn.ostrovok.ru/t/640x400/content/0d/30/0d30ec5e.JPEG',
    )
  })

  it('refuses an address of another host or kind', () => {
    expect(photoKey('https://evil.example/t/{size}/content/a.JPEG')).toBeNull()
    expect(photoKey('http://cdn.ostrovok.ru/t/{size}/content/a.JPEG')).toBeNull()
    expect(photoKey('https://cdn.ostrovok.ru/t/{size}/../secret')).toBeNull()
    expect(photoKey('')).toBeNull()
  })
})

describe('photoContentHash', () => {
  it('goes with the model, the dimensions and the key', () => {
    const sha = (text: string) => createHash('sha256').update(text).digest('hex')
    expect(photoContentHash('content/a.JPEG')).toBe(
      sha(`${PHOTO_EMBEDDING_MODEL}\n${PHOTO_EMBEDDING_DIMENSIONS}\ncontent/a.JPEG`),
    )
    expect(photoContentHash('content/a.JPEG')).not.toBe(photoContentHash('content/b.JPEG'))
  })
})

describe('isPhotoDataUrl', () => {
  it('takes data URLs of WebP and JPEG only', () => {
    expect(isPhotoDataUrl(photo)).toBe(true)
    expect(isPhotoDataUrl('data:image/webp;base64,UklGRhIAAABXRUJQVlA4')).toBe(true)
    expect(isPhotoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isPhotoDataUrl('https://cdn.ostrovok.ru/a.jpg')).toBe(false)
    expect(isPhotoDataUrl(`data:image/jpeg;base64,${'A'.repeat(1_500_000)}`)).toBe(false)
  })
})

describe('embedPhotos', () => {
  it('sends the photos as passages to the photo model and gives vectors of length 1 in the order of the photos', async () => {
    const fetch = stubFetch(200, {
      data: [
        { index: 1, embedding: vector(4) },
        { index: 0, embedding: vector(2) },
      ],
    })
    const vectors = await embedPhotos('test-key', [photo, photo])
    expect(vectors).toHaveLength(2)
    expect(vectors[0]).toHaveLength(PHOTO_EMBEDDING_DIMENSIONS)
    expect(Math.hypot(...vectors[0])).toBeCloseTo(1)
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://integrate.api.nvidia.com/v1/embeddings')
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer test-key')
    expect(JSON.parse(String(init!.body))).toEqual({
      model: PHOTO_EMBEDDING_MODEL,
      input: [photo, photo],
      input_type: 'passage',
      encoding_format: 'float',
    })
  })

  it('sends nothing that is not a photo, nor more photos than a request holds', async () => {
    const fetch = stubFetch(200, { data: [] })
    await expect(embedPhotos('k', ['https://evil.example/a.jpg'])).rejects.toThrow('only WebP or JPEG')
    await expect(embedPhotos('k', [])).rejects.toThrow('at a time')
    await expect(embedPhotos('k', Array(PHOTO_BATCH + 1).fill(photo))).rejects.toThrow('at a time')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws on a rejected photo (422) with its status and on an answer of the wrong shape', async () => {
    stubFetch(422, { detail: 'bad image' })
    await expect(embedPhotos('k', [photo])).rejects.toMatchObject({ statusCode: 422 })
    stubFetch(200, { data: [{ embedding: [1, 2, 3] }] })
    await expect(embedPhotos('k', [photo])).rejects.toThrow('1 vectors of 3 numbers')
    stubFetch(200, { data: [] })
    await expect(embedPhotos('k', [photo])).rejects.toThrow('0 vectors')
  })
})
