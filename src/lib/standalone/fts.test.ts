import { describe, expect, it } from 'vitest'
import { lexemeOf, matches, rank, stemRussian, toQuery, toVector } from './fts'

describe('the Russian stemmer', () => {
  // Postgres's `ts_lexize('russian_stem', w)` of these words (checked against the live database, 1500 words).
  it.each([
    ['завтраки', 'завтрак'],
    ['завтраком', 'завтрак'],
    ['отличные', 'отличн'],
    ['кроватка', 'кроватк'],
    ['расположение', 'расположен'],
    ['шумно', 'шумн'],
    ['понравилось', 'понрав'],
    ['ёлка', 'елк'],
  ])('stems %s to %s', (word, stem) => expect(stemRussian(word)).toBe(stem))

  it('drops the stop words of `russian.stop`, «хорошо» too', () => {
    expect(lexemeOf('и')).toBeNull()
    expect(lexemeOf('хорошо')).toBeNull()
    expect(lexemeOf('хороший')).toBe('хорош')
  })
})

describe('websearch queries', () => {
  const vector = toVector('Отличный завтрак и тихие номера, но рядом шумная дорога')

  it('needs every word', () => {
    expect(matches(vector, toQuery('хороший завтрак'))).toBe(false)
    expect(matches(vector, toQuery('завтраки номер'))).toBe(true)
  })

  it('knows «or», «-not» and a quoted phrase', () => {
    expect(matches(vector, toQuery('бассейн or завтрак'))).toBe(true)
    expect(matches(vector, toQuery('завтрак -дорога'))).toBe(false)
    expect(matches(vector, toQuery('"тихие номера"'))).toBe(true)
    expect(matches(vector, toQuery('"номера тихие"'))).toBe(false)
  })

  it('ranks a text with more of the words higher', () => {
    const query = toQuery('завтрак')
    expect(rank(toVector('завтрак, завтрак и ещё раз завтрак'), query)).toBeGreaterThan(
      rank(toVector('завтрак и ещё много других слов про отель и номер'), query),
    )
  })
})
