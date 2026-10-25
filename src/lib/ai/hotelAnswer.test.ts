import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { getHotel } from '../catalogGenerator'
import type { Hotel } from '../catalog'
import { answerWithModel, hotelFacts, NO_NEARBY_DATA, ruleAnswer } from './hotelAnswer'

const base = getHotel('prague-old-town-lantern')!
const hotel: Hotel = { ...base, amenities: ['wifi', 'parking', 'pets'] }
const bare: Hotel = { ...base, amenities: ['wifi'] }
const dates = { checkIn: '2026-11-10', checkOut: '2026-11-12' } as const

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
})

// assistant-search, Requirement: Пометка непроверенного
describe('answerWithModel', () => {
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
