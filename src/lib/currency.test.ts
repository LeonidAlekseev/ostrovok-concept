import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import { foldBrief, makePlan, parseWish } from './assistant'
import { budgetOf, parseBudget } from './currency'

describe('parseBudget', () => {
  it.each([
    ['до 200 евро за ночь', { rub: 18_000, perNight: true }],
    ['до 150$ в сутки', { rub: 12_150, perNight: true }],
    ['бюджет 50 тыс', { rub: 50_000, perNight: false }],
    ['до 300 евро за всё', { rub: 27_000, perNight: false }],
    ['до 70к', { rub: 70_000, perNight: false }],
    ['200 € за ночь', { rub: 18_000, perNight: true }],
    ['€200 за ночь', { rub: 18_000, perNight: true }],
    ['100 долларов', { rub: 8100, perNight: false }],
    ['до 120 eur', { rub: 10_800, perNight: false }],
    ['50 usd в ночь', { rub: 4050, perNight: true }],
    ['до 5000 руб', { rub: 5000, perNight: false }],
    ['до 80 000 ₽', { rub: 80_000, perNight: false }],
  ])('reads «%s»', (text, want) => expect(parseBudget(text)).toEqual(want))

  it('does not take the dates, the nights or the guests for a budget', () => {
    expect(parseBudget('20-23 ноября, вдвоём, на 5 ночей')).toBeUndefined()
  })
})

describe('budgetOf', () => {
  it('turns the model’s amount by its currency and period', () => {
    expect(budgetOf(200, 'eur', 'night')).toEqual({ rub: 18_000, perNight: true })
    expect(budgetOf(2000, 'usd', 'trip')).toEqual({ rub: 162_000, perNight: false })
    expect(budgetOf(null, 'eur')).toBeUndefined()
  })
})

const phrase =
  'Найди в Валенсии отель, где на фото номер с большой ванной и балконом, 20-23 ноября, вдвоём, до 200 евро за ночь'

describe('the budget of the request', () => {
  it('keeps a night’s budget and multiplies it by the nights of the stay', () => {
    const parsed = parseWish(phrase, destinations)
    expect(parsed.budgetPerNight).toBe(18_000)
    expect(parsed.budget).toBeUndefined()
    expect(parsed.vibe).toBeUndefined()
    const brief = foldBrief({}, { ...parsed, dates: { checkIn: '2026-11-20', checkOut: '2026-11-23' } }, phrase, null)
    expect(brief.budget).toBe(54_000)
    expect(brief.budgetPerNight).toBeUndefined()
  })

  it('keeps it per night until the nights are known, and plans by the plan’s nights', () => {
    const brief = foldBrief({}, parseWish('до 150$ в сутки', destinations), 'до 150$ в сутки', null)
    expect(brief).toEqual({ budgetPerNight: 12_150 })
    const plan = makePlan({ ...brief, destinationId: 'valencia', nights: 2 }, '2026-10-28', destinations, [])
    expect(plan.nights).toBe(2)
  })

  it('takes the whole trip’s sum as it is', () => {
    expect(foldBrief({}, parseWish('бюджет 50 тыс', destinations), 'бюджет 50 тыс', null).budget).toBe(50_000)
    expect(foldBrief({}, parseWish('до 300 евро за всё', destinations), '', null).budget).toBe(27_000)
  })
})
