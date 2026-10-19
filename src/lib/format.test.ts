import { describe, expect, it } from 'vitest'
import { pluralRu } from './format'

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
