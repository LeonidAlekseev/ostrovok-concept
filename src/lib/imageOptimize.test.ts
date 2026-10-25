// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  PHOTO_SIZE_ERROR,
  PHOTO_TYPE_ERROR,
  fitSize,
  optimizePhoto,
  photoError,
} from './imageOptimize'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** A canvas that encodes to `types` in turn (the first is what the browser gives for WebP) and records the sizes. */
function stubCanvas(encoded: { type: string; size?: number }[]) {
  const sizes: [number, number][] = []
  const asked: [string, number][] = []
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push([this.width, this.height])
    return context as never
  })
  let n = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type = '', quality = 0) => {
    asked.push([type, quality])
    const { type: given, size = 1000 } = encoded[n++ % encoded.length]
    callback(new Blob([new Uint8Array(size)], { type: given }))
  })
  return { sizes, asked, context }
}

const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() })

// assistant-search, Requirement: Фото во вложениях
describe('photoError', () => {
  it('takes JPEG, PNG and WebP up to 10 MB', () => {
    expect(photoError({ type: 'image/jpeg', size: 1 })).toBeNull()
    expect(photoError({ type: 'image/png', size: MAX_PHOTO_BYTES })).toBeNull()
    expect(photoError({ type: 'image/webp', size: 1 })).toBeNull()
    expect(photoError({ type: 'image/gif', size: 1 })).toBe(PHOTO_TYPE_ERROR)
    expect(photoError({ type: 'application/pdf', size: 1 })).toBe(PHOTO_TYPE_ERROR)
    expect(photoError({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toBe(PHOTO_SIZE_ERROR)
  })
})

describe('fitSize', () => {
  it('fits the long side, keeps the proportions and never enlarges', () => {
    expect(fitSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitSize(3000, 4000, 320)).toEqual({ width: 240, height: 320 })
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('optimizePhoto', () => {
  it('gives the photo of 1600 px and the preview of 320 px in WebP', async () => {
    const image = bitmap(4000, 3000)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => image),
    )
    const { sizes, asked } = stubCanvas([{ type: 'image/webp' }])
    const photo = await optimizePhoto(new Blob(['x'], { type: 'image/jpeg' }))
    expect(sizes).toEqual([
      [1600, 1200],
      [320, 240],
    ])
    expect(asked).toEqual([
      ['image/webp', 0.8],
      ['image/webp', 0.8],
    ])
    expect(photo).toMatchObject({ width: 1600, height: 1200 })
    expect(photo.photo).toMatch(/^data:image\/webp;base64,/)
    expect(photo.preview).toMatch(/^data:image\/webp;base64,/)
    expect(image.close).toHaveBeenCalled()
  })

  it('gives JPEG where the browser cannot encode WebP', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap(100, 100)),
    )
    const { asked } = stubCanvas([{ type: 'image/png' }, { type: 'image/jpeg' }])
    const photo = await optimizePhoto(new Blob(['x']))
    expect(asked.slice(0, 2)).toEqual([
      ['image/webp', 0.8],
      ['image/jpeg', 0.8],
    ])
    expect(photo.photo).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('encodes a heavy photo again, coarser', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap(1600, 1600)),
    )
    const { asked } = stubCanvas([{ type: 'image/webp', size: 900_000 }])
    await optimizePhoto(new Blob(['x']))
    expect(asked[1]).toEqual(['image/webp', 0.6])
  })

  it('throws on a file the browser cannot open', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('bad', 'InvalidStateError')
      }),
    )
    await expect(optimizePhoto(new Blob(['x']))).rejects.toThrow()
  })
})
