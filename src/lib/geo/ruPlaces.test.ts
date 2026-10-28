import { describe, expect, it } from 'vitest'
import { officialPlaceName } from './ruPlaces'

// assistant-geo, Requirement: Словарь русских названий мест
describe('the Russian names of the places of Valencia', () => {
  it.each([
    ['Город искусств и наук', 'Ciutat de les Arts i les Ciències'],
    ['до города искусств и наук', 'Ciutat de les Arts i les Ciències'],
    ['города искусств и наук', 'Ciutat de les Arts i les Ciències'],
    ['Центральный рынок', 'Mercat Central'],
    ['центрального рынка', 'Mercat Central'],
    ['Шёлковая биржа', 'Llotja de la Seda'],
    ['шелковой биржи', 'Llotja de la Seda'],
    ['Mercado Central', undefined],
    ['Музей хамона', undefined],
  ])('%s → %s', (query, official) => {
    expect(officialPlaceName(query)).toBe(official)
  })
})
