import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { getHotel } from '../catalogGenerator'
import type { Hotel } from '../catalog'
import type { HotelDetails } from '../hotelDetails'
import { answerWithModel, hotelFacts, isRussian, NO_NEARBY_DATA, ruleAnswer } from './hotelAnswer'

const base = getHotel('prague-old-town-lantern')!
const hotel: Hotel = { ...base, amenities: ['wifi', 'parking', 'pets'] }
const bare: Hotel = { ...base, amenities: ['wifi'] }
const dates = { checkIn: '2026-11-10', checkOut: '2026-11-12' } as const

/** What a real hotel's Ostrovok page gives. */
const details: HotelDetails = {
  description: [],
  amenityGroups: [{ name: 'Парковка', slug: 'has_parking', amenities: ['Парковка рядом с отелем'] }],
  policies: [
    { label: 'Парковка рядом с отелем', value: '22 € за машину в сутки' },
    { label: 'Размещение с питомцами', value: '15 € за питомца за проживание' },
  ],
  notes: null,
  facts: { rooms: 140, roomFloors: 6, yearBuilt: null, yearRenovated: null, electricity: null },
  building: { floors: 19, heightM: 60, estimated: true },
  scores: [{ source: 'tripadvisor', rating: 4.5, scale: 5, reviewCount: 1327, sections: [] }],
  reviews: [
    {
      id: 'r',
      author: 'Анна',
      date: '2022-08-06',
      score: 8,
      text: 'Номер с видом на море.',
      source: 'tripadvisor',
      helpful: 0,
    },
  ],
  nearby: [
    {
      id: 1,
      name: 'Фира Валенсия',
      kind: 'Станция',
      distanceM: 135,
      bearingDeg: 10,
      lat: 39.5,
      lon: -0.42,
      transport: true,
    },
    {
      id: 2,
      name: 'Зоопарк Биопарк',
      kind: 'Зоопарк или аквариум',
      distanceM: 3165,
      bearingDeg: 120,
      lat: 39.47,
      lon: -0.4,
      transport: false,
    },
  ],
  viewQuotes: [{ reviewId: 'r', source: 'tripadvisor', author: 'Анна', text: 'Номер с видом на море.' }],
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}
const modelSays = (fields: Record<string, unknown>) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text' as const, text: JSON.stringify(fields) }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage,
      warnings: [],
    },
  })

// assistant-search, Requirement: Вопрос об отеле
describe('ruleAnswer', () => {
  it('lists the rooms without prices and asks for the dates (Scenario: Номера без дат)', () => {
    const { answer, unverified } = ruleAnswer('Какие номера есть?', hotel)
    for (const room of hotel.rooms) expect(answer).toContain(room.name)
    expect(answer).not.toContain('₽')
    expect(answer).toContain('Выберите даты')
    expect(unverified).toBeUndefined()
  })

  it('prices the rooms on the chat’s dates', () => {
    const { answer } = ruleAnswer('Какие номера есть?', hotel, dates)
    expect(answer).toMatch(/₽ за ночь, .*₽ за 2 н\./)
    expect(answer).not.toContain('Выберите даты')
  })

  it('answers the parking and the pets from the amenities', () => {
    expect(ruleAnswer('Есть ли парковка?', hotel).answer).toMatch(/^Да: парковка/)
    expect(ruleAnswer('Можно с питомцами?', hotel).answer).toMatch(/^Да, можно с питомцами \(за отдельную плату\)/)
    expect(ruleAnswer('Есть ли парковка?', bare).answer).toContain('парковка не указана')
    expect(ruleAnswer('Можно с питомцами?', bare).answer).toContain('о размещении с питомцами ничего не сказано')
  })

  it('refuses «Что рядом?» without a place, with the distances only (Scenario: Без модели)', () => {
    const { answer } = ruleAnswer('Что рядом с отелем?', hotel)
    expect(answer).toContain(NO_NEARBY_DATA)
    expect(answer).toMatch(/до центра [\d,]+ км/)
  })

  it('names Ostrovok’s places nearby with their distances when the hotel’s page has them', () => {
    const { answer, unverified } = ruleAnswer('Что рядом с отелем?', hotel, undefined, details)
    expect(answer).toBe(
      'Рядом с отелем, по данным Островка:\n• Фира Валенсия (станция) — 140 м\n• Зоопарк Биопарк (зоопарк или аквариум) — 3,2 км',
    )
    expect(answer).not.toContain(NO_NEARBY_DATA)
    expect(unverified).toBeUndefined()
  })

  it('adds the page’s prices of the parking and of the pets', () => {
    expect(ruleAnswer('Есть ли парковка?', hotel, undefined, details).answer).toMatch(
      /^Да: парковка.* Парковка рядом с отелем: 22 € за машину в сутки\.$/,
    )
    expect(ruleAnswer('Есть ли парковка?', bare, undefined, details).answer).toBe(
      'По данным отеля: Парковка рядом с отелем: 22 € за машину в сутки.',
    )
    expect(ruleAnswer('Можно с питомцами?', hotel, undefined, details).answer).toMatch(
      /Размещение с питомцами: 15 € за питомца за проживание\.$/,
    )
  })

  it('refuses any other question', () => {
    expect(ruleAnswer('Расскажи анекдот', hotel).answer).toBe('Сейчас не могу ответить. Попробуйте позже.')
  })
})

describe('hotelFacts', () => {
  it('carries the data of the hotel and says there are no places nearby', () => {
    const facts = hotelFacts(hotel, dates)
    expect(facts).toContain(hotel.name)
    expect(facts).toContain('Парковка')
    expect(facts).toContain('2026-11-10 — 2026-11-12')
    expect(facts).toContain('Данных о местах рядом')
    expect(hotelFacts(hotel)).toContain('Даты не выбраны')
  })

  it('carries the page: the places, the fees, the floors of the rooms apart from the building’s, the view quotes', () => {
    const facts = hotelFacts({ ...hotel, wifiMbps: null }, undefined, { floors: 19, views: [] }, details)
    expect(facts).toContain('Места рядом (по данным Островка, расстояние от отеля):\n- Фира Валенсия (станция) — 140 м')
    expect(facts).toContain('- Парковка рядом с отелем: 22 € за машину в сутки')
    expect(facts).toContain('Этажей в здании (EUBUCCO): 19')
    expect(facts).toContain('Номера занимают 6 этажей (по данным отеля)')
    expect(facts).not.toContain('В здании 19 этажей')
    expect(facts).toContain('- «Номер с видом на море.» (TripAdvisor)')
    expect(facts).toContain('Скорость Wi‑Fi неизвестна')
    expect(facts).not.toContain('Данных о местах рядом')
  })

  it('says there are no reliable data of a doubtful building, and gives none of its floors', () => {
    const facts = hotelFacts(hotel, undefined, { views: [], buildingDoubtful: true }, details)
    expect(facts).toContain('Этажность и высота здания: надёжных данных по зданию нет')
    expect(facts).not.toContain('Этажей в здании')
    expect(facts).toContain('Номера занимают 6 этажей (по данным отеля)')
  })
})

// assistant-search, Requirement: Пометка непроверенного
describe('answerWithModel', () => {
  it('accepts the Latin name of the hotel and «Wi‑Fi» in a Russian answer', async () => {
    const text = `В отеле ${hotel.name} есть бесплатный Wi‑Fi и парковка на Av Ausias March.`
    expect(isRussian(text)).toBe(true)
    expect(await ask(modelSays({ answer: text, unverified: 'Рядом, возможно, есть Mercado Central.' }))).toEqual({
      answer: text,
      unverified: 'Рядом, возможно, есть Mercado Central.',
    })
  })

  it('rejects an answer in English or in another script', async () => {
    expect(isRussian('The hotel has free Wi-Fi and parking.')).toBe(false)
    expect(isRussian('酒店有免费停车位')).toBe(false)
    await expect(ask(modelSays({ answer: 'The hotel has free Wi-Fi and parking.', unverified: null }))).rejects.toThrow(
      'no answer',
    )
    expect(await ask(modelSays({ answer: 'Есть парковка.', unverified: 'There is a cafe nearby.' }))).toEqual({
      answer: 'Есть парковка.',
    })
  })

  const ask = (model: MockLanguageModelV4) =>
    answerWithModel(model, { messages: [{ role: 'user', text: 'Что рядом с отелем?' }] }, hotel, { dates })

  it('splits the answer from the data and the model’s own knowledge', async () => {
    const model = modelSays({ answer: 'До центра недалеко.', unverified: 'Рядом, возможно, есть кафе.' })
    expect(await ask(model)).toEqual({ answer: 'До центра недалеко.', unverified: 'Рядом, возможно, есть кафе.' })
    const [call] = model.doGenerateCalls
    expect(call.prompt[0].content).toContain(hotel.name)
    expect(call.prompt[0].content).toContain('ТОЛЬКО то, что есть в данных')
    expect(call.reasoning).toBe('none')
  })

  it('has no unverified part when the model adds nothing', async () => {
    expect(await ask(modelSays({ answer: 'Есть парковка.', unverified: null }))).toEqual({ answer: 'Есть парковка.' })
    expect(await ask(modelSays({ answer: 'Есть парковка.' }))).toEqual({ answer: 'Есть парковка.' })
  })

  it('drops a part with letters of other scripts and fails on an empty answer', async () => {
    expect(await ask(modelSays({ answer: 'Есть парковка.', unverified: '탐험 рядом кафе' }))).toEqual({
      answer: 'Есть парковка.',
    })
    await expect(ask(modelSays({ answer: '  ', unverified: null }))).rejects.toThrow('no answer')
  })
})
