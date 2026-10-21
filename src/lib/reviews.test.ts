import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ratingLabel, SCORE_STOPS, scoreColor, scoreOnDark } from './reviews'

// hotel-page, Requirement: Блок оценки
describe('ratingLabel', () => {
  it('names the rating at the bounds 9, 8, 7 and 6', () => {
    expect(ratingLabel(9.8)).toBe('Превосходно')
    expect(ratingLabel(9)).toBe('Превосходно')
    expect(ratingLabel(8.9)).toBe('Отлично')
    expect(ratingLabel(8)).toBe('Отлично')
    expect(ratingLabel(7.9)).toBe('Очень хорошо')
    expect(ratingLabel(7)).toBe('Очень хорошо')
    expect(ratingLabel(6.9)).toBe('Хорошо')
    expect(ratingLabel(6)).toBe('Хорошо')
    expect(ratingLabel(5.9)).toBe('Неплохо')
  })
})

// The token values of globals.css, followed through `var()` to a hex colour.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
function tokenHex(name: string): string {
  const value = css.match(new RegExp(`\\s${name}:\\s*([^;]+);`))![1].trim()
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  return ref ? tokenHex(ref[1]) : value
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toLinear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const luminance = (color: number[]) => {
  const [r, g, b] = color.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** sRGB to OKLCh and back (Björn Ottosson's OKLab), the space of `color-mix(in oklch, …)`. */
function toOklch(color: number[]): number[] {
  const [r, g, b] = color.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), Math.atan2(bb, a)]
}
function fromOklch([lightness, chroma, hue]: number[]): number[] {
  const [a, b] = [chroma * Math.cos(hue), chroma * Math.sin(hue)]
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(255, Math.max(0, fromLinear(v))))
}
/** Mixed along the shorter hue arc, as `color-mix` does by default. */
function mixOklch(from: number[], to: number[], share: number): number[] {
  const [a, b] = [toOklch(from), toOklch(to)]
  let hue = b[2] - a[2]
  if (hue > Math.PI) hue -= 2 * Math.PI
  if (hue < -Math.PI) hue += 2 * Math.PI
  return fromOklch([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + hue * share])
}
const contrast = (a: number[], b: number[]) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The colour scoreColor gives, mixed the way `color-mix(in oklch, …)` does. */
function mixed(score: number): number[] {
  const value = scoreColor(score)
  const plain = value.match(/^var\((--[\w-]+)\)$/)
  if (plain) return rgb(tokenHex(plain[1]))
  const [, from, to, share] = value.match(/var\((--[\w-]+)\), var\((--[\w-]+)\) (\d+)%/)!
  return mixOklch(rgb(tokenHex(from)), rgb(tokenHex(to)), Number(share) / 100)
}

// hotel-page, Requirement: Цвет оценки
describe('scoreColor', () => {
  it('is red at 5 and below, yellow at 7, lime at 8, green at 9 and above', () => {
    expect(scoreColor(2)).toBe('var(--score-low)')
    expect(scoreColor(5)).toBe('var(--score-low)')
    expect(scoreColor(7)).toBe('color-mix(in oklch, var(--score-mid), var(--score-good) 0%)')
    expect(scoreColor(8)).toBe('color-mix(in oklch, var(--score-good), var(--score-high) 0%)')
    expect(scoreColor(9)).toBe('var(--score-high)')
    expect(scoreColor(9.2)).toBe('var(--score-high)')
  })

  it('mixes the neighbouring stops in oklch in between: Wi‑Fi at 6,1 is yellow-orange', () => {
    expect(scoreColor(6.1)).toBe('color-mix(in oklch, var(--score-low), var(--score-mid) 55%)')
    expect(scoreColor(8.5)).toBe('color-mix(in oklch, var(--score-good), var(--score-high) 50%)')
  })

  it('makes 7,7–7,9 yellow-green, not olive: green above red, red above blue, bright', () => {
    for (const score of [7.7, 7.8, 7.9]) {
      const [r, g, b] = mixed(score)
      expect(g, `${score}`).toBeGreaterThan(r)
      expect(r, `${score}`).toBeGreaterThan(b)
      // Olive, the sRGB mix of yellow and green, has lightness about 0.7; these stay above 0.75.
      expect(toOklch([r, g, b])[0], `${score}`).toBeGreaterThan(0.75)
    }
  })

  it('has every stop in the theme', () => {
    for (const { color } of SCORE_STOPS) expect(tokenHex(color)).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keeps the figure of the badge readable: at least 3:1 for the large bold text', () => {
    const white = [255, 255, 255]
    const dark = rgb(tokenHex('--brand-text'))
    for (let tenths = 10; tenths <= 100; tenths++) {
      const score = tenths / 10
      const text = scoreOnDark(score) ? white : dark
      expect(contrast(mixed(score), text), `${score}`).toBeGreaterThanOrEqual(3)
    }
  })
})
