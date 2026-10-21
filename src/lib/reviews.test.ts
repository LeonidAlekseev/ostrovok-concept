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
const luminance = (color: number[]) => {
  const [r, g, b] = color.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number[], b: number[]) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The colour scoreColor gives, mixed in sRGB the way `color-mix(in srgb, …)` does. */
function mixed(score: number): number[] {
  const value = scoreColor(score)
  const plain = value.match(/^var\((--[\w-]+)\)$/)
  if (plain) return rgb(tokenHex(plain[1]))
  const [, from, to, share] = value.match(/var\((--[\w-]+)\), var\((--[\w-]+)\) (\d+)%/)!
  const [a, b] = [rgb(tokenHex(from)), rgb(tokenHex(to))]
  return a.map((v, i) => v + ((b[i] - v) * Number(share)) / 100)
}

// hotel-page, Requirement: Цвет оценки
describe('scoreColor', () => {
  it('is red at 5 and below, yellow at 7, green at 9 and above', () => {
    expect(scoreColor(2)).toBe('var(--score-low)')
    expect(scoreColor(5)).toBe('var(--score-low)')
    expect(scoreColor(7)).toBe('color-mix(in srgb, var(--score-mid), var(--score-high) 0%)')
    expect(scoreColor(9)).toBe('var(--score-high)')
    expect(scoreColor(9.2)).toBe('var(--score-high)')
  })

  it('mixes the neighbouring stops in between: Wi‑Fi at 6,1 is yellow-orange', () => {
    expect(scoreColor(6.1)).toBe('color-mix(in srgb, var(--score-low), var(--score-mid) 55%)')
    expect(scoreColor(8)).toBe('color-mix(in srgb, var(--score-mid), var(--score-high) 50%)')
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
