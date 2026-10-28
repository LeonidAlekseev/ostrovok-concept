import { describe, expect, it } from 'vitest'
import { clipText, formatDecimal, pluralRu } from './format'

const guests: [string, string, string] = ['гость', 'гостя', 'гостей']

describe('pluralRu', () => {
  it.each([
    [1, 'гость'],
    [2, 'гостя'],
    [5, 'гостей'],
    [11, 'гостей'],
    [21, 'гость'],
    [22, 'гостя'],
  ])('%i → %s', (n, form) => {
    expect(pluralRu(n, guests)).toBe(form)
  })
})

describe('formatDecimal', () => {
  it('uses one digit and a decimal comma', () => {
    expect(formatDecimal(9.4)).toBe('9,4')
    expect(formatDecimal(2)).toBe('2,0')
    expect(formatDecimal(1.25)).toBe('1,3')
  })
})

describe('clipText', () => {
  it('cuts a long text at a word, never inside one', () => {
    expect(clipText('Кондиционер есть в номерах Superior', 31)).toBe('Кондиционер есть в номерах…')
    expect(clipText('Есть балкон, окна на запад', 14)).toBe('Есть балкон…')
    expect(clipText('Коротко', 20)).toBe('Коротко')
    expect(clipText('а'.repeat(30), 10)).toBe(`${'а'.repeat(9)}…`)
    expect(clipText('Кондиционер есть в номерах Superior', 31).length).toBeLessThanOrEqual(31)
  })
})
