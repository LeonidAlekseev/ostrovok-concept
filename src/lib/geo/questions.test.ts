import { describe, expect, it } from 'vitest'
import { isGeoQuestion, placeAfterTo, questionCategories } from './questions'

// assistant-geo, Requirement: Гео-шаги в ходе Эвала
describe('the words of a question about the places near', () => {
  it('name the kinds of places the guests ask about', () => {
    expect(questionCategories('Есть ли больницы рядом?')).toEqual(['hospital'])
    expect(questionCategories('Сколько идти до аптеки?')).toEqual(['pharmacy'])
    expect(questionCategories('Есть ли бар или клуб рядом?')).toEqual(['bar', 'nightclub'])
    expect(questionCategories('Сколько до моря?')).toEqual(['beach', 'sea'])
    expect(questionCategories('Далеко ли центр и аэропорт?')).toEqual(['airport', 'centre'])
  })

  it('do not take a word for a kind it only starts like', () => {
    expect(questionCategories('Летим из Барселоны')).toEqual([])
    expect(questionCategories('Есть ли парковка?')).toEqual([])
    expect(questionCategories('Сколько идти до Центрального рынка?')).toEqual([])
    expect(questionCategories('Есть ли кофеварка в номере?')).toEqual([])
    expect(questionCategories('Какая поездка до отеля?')).toEqual([])
  })

  it('tell a question for the geo tools', () => {
    expect(isGeoQuestion('Что рядом с отелем?')).toBe(true)
    expect(isGeoQuestion('Сколько идти до Центрального рынка?')).toBe(true)
    expect(isGeoQuestion('Есть ли парковка?')).toBe(false)
    expect(isGeoQuestion('Какие номера есть?')).toBe(false)
    expect(isGeoQuestion('Можно с питомцами?')).toBe(false)
  })
})

// assistant-geo, Requirement: Название места после «до»
describe('the name after «до»', () => {
  it.each([
    ['Сколько идти до Центрального рынка?', 'Центрального рынка'],
    ['Как добраться до Mercado Central пешком', 'Mercado Central'],
    ['Далеко ли до Города искусств и наук от отеля?', 'Города искусств и наук'],
    ['сколько ехать до Ciutat de les Arts i les Ciències на такси', 'Ciutat de les Arts i les Ciències'],
    ['Сколько идти до аптеки?', undefined],
    ['Далеко до метро?', undefined],
    ['Какая поездка до отеля?', undefined],
    ['Открыт до 10 вечера?', undefined],
    ['Что рядом?', undefined],
  ])('%s → %s', (text, name) => {
    expect(placeAfterTo(text)).toBe(name)
  })
})
