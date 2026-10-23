import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStars } from '../../lib/horoscope'
import { destinations } from '../../data/destinations'
import { allHotels } from '../../test/catalog'
import { drawReadingFrame, loadPicture } from './starVideo'

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

const pick = { title: 'Рим для двоих', place: 'Рим, Италия', estimate: '≈ 84 000 ₽ за 5 ночей' }

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
  ['primary', 'violet', 'magenta', 'indigo', 'gold', 'goldDeep', 'light', 'lavender', 'sky', 'line'].map((k) => [
    k,
    '#123456',
  ]),
) as Parameters<typeof drawReadingFrame>[5]['p']

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
    const image = await loadPicture('/images/stars/orb.webp')
    expect(image).not.toBeNull()
    expect(decode).toHaveBeenCalled()
  })

  it('is null when the picture did not load', async () => {
    stubImage(() => Promise.reject(new DOMException('broken', 'EncodingError')))
    expect(await loadPicture('/images/stars/orb.webp')).toBeNull()
  })

  it('is drawn as a picture', () => {
    const { ctx, calls } = fakeContext()
    const orb = {} as HTMLImageElement
    drawReadingFrame(ctx, reading, 'Анна', pick, 1000, {
      p: palette,
      font: 'sans-serif',
      serif: 'serif',
      site: 'x.test',
      orb,
      sky: null,
    })
    expect(calls).toContain('drawImage')
    expect(calls).not.toContain('createConicGradient')
  })

  it('falls back to the drawn orb without the picture', () => {
    const { ctx, calls } = fakeContext()
    drawReadingFrame(ctx, reading, 'Анна', pick, 1000, {
      p: palette,
      font: 'sans-serif',
      serif: 'serif',
      site: 'x.test',
      orb: null,
      sky: null,
    })
    expect(calls).not.toContain('drawImage')
    expect(calls).toContain('createConicGradient')
  })

  it('stands on the window sky picture, or on a night gradient without it', () => {
    const style = { p: palette, font: 'sans-serif', serif: 'serif', site: 'x.test', orb: null }
    const sky = { width: 1006, height: 1564 } as HTMLImageElement
    const withSky = fakeContext()
    drawReadingFrame(withSky.ctx, reading, 'Анна', pick, 1000, { ...style, sky })
    expect(withSky.calls).toContain('drawImage')
    const without = fakeContext()
    drawReadingFrame(without.ctx, reading, 'Анна', pick, 1000, { ...style, sky: null })
    expect(without.calls).toContain('createLinearGradient')
    expect(without.calls).not.toContain('drawImage')
  })
})
