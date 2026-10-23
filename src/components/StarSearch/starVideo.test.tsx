import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStars } from '../../lib/horoscope'
import { destinations } from '../../data/destinations'
import { allHotels } from '../../test/catalog'
import { drawReadingFrame, loadOrbImage } from './starVideo'

const reading = readStars(
  {
    name: 'Анна',
    birthMonth: 3,
    birthDay: 21,
    checkIn: '2026-10-26',
    company: 'solo',
  },
  destinations,
  allHotels(),
)

afterEach(() => vi.unstubAllGlobals())

function stubImage(decode: () => Promise<void>) {
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode = decode
    },
  )
}

const palette = Object.fromEntries(
  ['primary', 'violet', 'magenta', 'lime', 'gold', 'light', 'ink', 'muted', 'soft'].map((k) => [k, '#123456']),
) as Parameters<typeof drawReadingFrame>[4]['p']

/** A canvas context that remembers what was drawn. */
function fakeContext() {
  const gradient = { addColorStop: vi.fn() }
  const calls: string[] = []
  const ctx = new Proxy({ globalCompositeOperation: 'source-over' } as Record<string, unknown>, {
    get: (target, key: string) =>
      key in target
        ? target[key]
        : (...args: unknown[]) => {
            calls.push(key)
            if (key.startsWith('create')) return gradient
            if (key === 'measureText') return { width: 10 * String(args[0]).length }
          },
    set: (target, key: string, value) => ((target[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('orb picture of the video', () => {
  it('is decoded before the recording', async () => {
    const decode = vi.fn(async () => {})
    stubImage(decode)
    const image = await loadOrbImage()
    expect(image).not.toBeNull()
    expect(decode).toHaveBeenCalled()
  })

  it('is null when the picture did not load', async () => {
    stubImage(() => Promise.reject(new DOMException('broken', 'EncodingError')))
    expect(await loadOrbImage()).toBeNull()
  })

  it('is drawn as a picture', () => {
    const { ctx, calls } = fakeContext()
    const orb = {} as HTMLImageElement
    drawReadingFrame(ctx, reading, 'Анна', 1000, { p: palette, font: 'sans-serif', site: 'x.test', orb })
    expect(calls).toContain('drawImage')
    expect(calls).not.toContain('createConicGradient')
  })

  it('falls back to the drawn orb without the picture', () => {
    const { ctx, calls } = fakeContext()
    drawReadingFrame(ctx, reading, 'Анна', 1000, { p: palette, font: 'sans-serif', site: 'x.test', orb: null })
    expect(calls).not.toContain('drawImage')
    expect(calls).toContain('createConicGradient')
  })
})
