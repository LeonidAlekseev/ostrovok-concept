import { describe, expect, it } from 'vitest'
import { stayTotal } from './offer'
import { hotels, newHotels } from './catalogGenerator'
import { destinations } from '../data/destinations'
import { briefPersona, makePlan, mergeBrief, parseWish } from './assistant'

describe('parseWish', () => {
  it('reads theme, month and budget from a full request', () => {
    expect(parseWish('Хочу на море в октябре, бюджет до 70 000 ₽', destinations)).toEqual({
      vibe: 'sea',
      when: 9,
      budget: 70_000,
    })
  })

  it('reads party, mood, nights and a "70к" budget', () => {
    expect(parseWish('В горы на 5 ночей с детьми, 70к, спокойно', destinations)).toEqual({
      vibe: 'mountains',
      party: 'family',
      mood: 'calm',
      nights: 5,
      budget: 70_000,
    })
  })

  it('treats a weekend as two nights soon and reads a "тыс." budget', () => {
    expect(parseWish('На выходные вдвоём до 50 тыс.', destinations)).toEqual({
      vibe: 'weekend',
      party: 'couple',
      nights: 2,
      when: 'soon',
      budget: 50_000,
    })
  })

  it('reads a season, friends and a plain budget', () => {
    expect(parseWish('летом с друзьями, бюджет 120000', destinations)).toEqual({
      party: 'friends',
      when: 6,
      budget: 120_000,
    })
  })

  it('reads a catalogue city named in the nominative case', () => {
    expect(parseWish('Прага, скоро', destinations)).toEqual({ destinationId: 'prague', when: 'soon' })
  })

  it('does not read a city named in another case', () => {
    // Diverges from assistant-search spec, "Разбор пожелания": the assistant SHALL extract
    // a named catalogue city, but only the exact nominative name is matched.
    expect(parseWish('Хочу в Прагу, что-то активное, на неделю', destinations)).toEqual({ mood: 'active', nights: 7 })
  })

  it('leaves unknown fields undefined', () => {
    expect(parseWish('привет', destinations)).toEqual({})
  })
})

describe('mergeBrief', () => {
  it('adds new answers to what is already known', () => {
    expect(mergeBrief({ vibe: 'sea', when: 9 }, 'вдвоём', 'party', destinations)).toEqual({
      vibe: 'sea',
      when: 9,
      party: 'couple',
    })
  })

  it('keeps the theme when a later reply says "на выходные"', () => {
    expect(mergeBrief({ vibe: 'sea', when: 9 }, 'на выходные', 'when', destinations)).toEqual({
      vibe: 'sea',
      when: 'soon',
      nights: 2,
    })
  })

  it('hands the asked question over to the assistant on "не важно"', () => {
    expect(mergeBrief({ vibe: 'sea' }, 'не важно', 'when', destinations)).toEqual({ vibe: 'sea', when: 'any' })
    expect(mergeBrief({ vibe: 'sea', when: 9 }, 'без разницы', 'party', destinations)).toEqual({
      vibe: 'sea',
      when: 9,
      party: 'any',
    })
  })

  it('hands over the theme on "удиви меня" without a pending question', () => {
    expect(mergeBrief({}, 'удиви меня', null, destinations)).toEqual({ vibe: 'any' })
  })

  it('does not hand over a question the reply already answered', () => {
    expect(mergeBrief({}, 'не знаю, наверное на море', 'vibe', destinations)).toEqual({ vibe: 'sea' })
  })
})

describe('makePlan', () => {
  const today = '2026-10-19' // Monday

  it('plans a theme chosen by the traveller', () => {
    const plan = makePlan({ vibe: 'sea', when: 10, party: 'couple' }, today, destinations, newHotels)
    expect(plan).toMatchObject({
      emoji: '🌊',
      atmosphere: 'Морской бриз',
      why: 'Солёный ветер, пляж и закаты над водой.',
      nights: 5,
      query: { checkIn: '2026-11-07', checkOut: '2026-11-12', guests: { adults: 2, children: 0, rooms: 1 } },
      overBudget: false,
    })
  })

  it('offers only warm destinations for the sea in winter', () => {
    const plan = makePlan({ vibe: 'sea', when: 0, party: 'solo' }, today, destinations, newHotels)
    expect(plan.options.length).toBeGreaterThan(0)
    for (const o of plan.options) expect(['dubai', 'cancun', 'honolulu', 'miami']).toContain(o.destination.id)
  })

  it('explains its own pick when the theme is left open', () => {
    const plan = makePlan({ vibe: 'any', when: 'any', party: 'any' }, today, destinations, newHotels)
    expect(plan.atmosphere).toBe('Далеко-далеко')
    expect(plan.why).toBe('Выбрал сам: зимой хочется туда, где лето. Значит, лето посреди любого сезона.')
  })

  it('offers at most three options, those within budget first', () => {
    const plan = makePlan({ vibe: 'europe', when: 4, party: 'couple', budget: 40_000 }, today, destinations, newHotels)
    expect(plan.options).toHaveLength(3)
    const fits = plan.options.map((o) => o.fitsBudget)
    expect(fits).toEqual([...fits].sort((a, b) => Number(b) - Number(a)))
    expect(fits[0]).toBe(true)
    for (const o of plan.options)
      expect(o.total).toBe(stayTotal(o.perNight, plan.query.checkIn, plan.query.checkOut, plan.query.guests.rooms))
  })

  // assistant-search, Requirement: Вариант вне бюджета
  it('offers the cheapest hotel of the destination when none fits the budget', () => {
    const { options, overBudget } = makePlan(
      { destinationId: 'prague', when: 'soon', party: 'couple', budget: 1 },
      today,
      destinations,
      newHotels,
    )
    const [option] = options
    const cheapest = Math.min(...newHotels.filter((h) => h.destinationId === 'prague').map((h) => h.priceFrom))
    expect(option.fitsBudget).toBe(false)
    expect(option.perNight).toBe(cheapest)
    expect(overBudget).toBe(true)
  })

  // assistant-search, Requirement: Сумма поездки ассистента
  it('prices the weekend nights higher and checks the budget by that sum', () => {
    const brief = { destinationId: 'prague', when: 'soon' as const, party: 'couple' as const }
    const { options, query } = makePlan(brief, today, destinations, newHotels)
    const [option] = options
    // Check-in on Friday: Friday and Saturday cost more than two weekday nights.
    expect(new Date(query.checkIn).getUTCDay()).toBe(5)
    expect(option.total).toBeGreaterThan(option.perNight * 2)
    // The weekday sum would fit this budget; with the weekend nights the hotel no longer does.
    const budget = option.perNight * query.guests.rooms * 2
    const tight = makePlan({ ...brief, budget }, today, destinations, newHotels).options[0]
    expect(tight.fitsBudget).toBe(tight.total <= budget)
    if (tight.hotel?.id === option.hotel?.id) expect(tight.fitsBudget).toBe(false)
  })

  it('marks the plan over budget when no option fits', () => {
    const plan = makePlan(
      { destinationId: 'prague', when: 'soon', party: 'friends', budget: 1000 },
      today,
      destinations,
      newHotels,
    )
    expect(plan).toMatchObject({
      nights: 2,
      query: { checkIn: '2026-10-23', checkOut: '2026-10-25', guests: { adults: 4, children: 0, rooms: 2 } },
      overBudget: true,
    })
    expect(plan.options).toHaveLength(1)
    expect(plan.options[0]).toMatchObject({
      destination: { id: 'prague' },
      perNight: 6900,
      total: 32_000,
      fitsBudget: false,
    })
  })

  it('caps nights at 30 and gives families a week by default', () => {
    expect(makePlan({ vibe: 'sea', when: 6, party: 'family' }, today, destinations, newHotels).nights).toBe(7)
    expect(makePlan({ vibe: 'sea', when: 6, party: 'solo', nights: 45 }, today, destinations, newHotels).nights).toBe(
      30,
    )
  })
})

describe('makePlan with the semantic matches', () => {
  const today = '2026-10-19'
  const inCity = (id: string) => hotels.filter((h) => h.destinationId === id)

  it('leads a named city’s plan with up to three matches in their order', () => {
    const [a, b, c, d] = inCity('prague')
    const plan = makePlan({ destinationId: 'prague', when: 5, party: 'solo' }, today, destinations, newHotels, [
      c,
      a,
      d,
      b,
    ])
    expect(plan.options.map((o) => o.hotel?.id)).toEqual([c.id, a.id, d.id])
    expect(plan.options.every((o) => o.destination.id === 'prague')).toBe(true)
  })

  it('takes one match a city of the plan and fills the rest by the rules', () => {
    const brief = { vibe: 'sea', when: 6, party: 'couple' } as const
    const cities = makePlan(brief, today, destinations, newHotels).options.map((o) => o.destination.id)
    const [first, second] = inCity(cities[1])
    const elsewhere = hotels.find((h) => !cities.includes(h.destinationId) && h.destinationId !== 'prague')!
    const plan = makePlan(brief, today, destinations, newHotels, [elsewhere, first, second])
    expect(plan.options[0].hotel?.id).toBe(first.id)
    expect(plan.options.map((o) => o.destination.id)).not.toContain(elsewhere.destinationId)
    expect(new Set(plan.options.map((o) => o.destination.id)).size).toBe(plan.options.length)
    expect(plan.options).toHaveLength(3)
  })

  it('puts the matches within the budget first', () => {
    const [cheap, dear] = [...inCity('prague')]
      .sort((x, y) => x.priceFrom - y.priceFrom)
      .filter((_, i, l) => i === 0 || i === l.length - 1)
    const brief = { destinationId: 'prague', when: 5, party: 'solo', nights: 2, budget: cheap.priceFrom * 3 } as const
    const plan = makePlan(brief, today, destinations, newHotels, [dear, cheap])
    expect(plan.options.map((o) => o.hotel?.id)).toEqual([cheap.id, dear.id])
    expect(plan.options[1].fitsBudget).toBe(false)
  })
})

// routes, Requirement: Лучший готовый маршрут
describe('briefPersona', () => {
  it('reads work on the way, luxury, a student’s trip, else the culture', () => {
    expect(briefPersona({}, 'Поработать с ноутбуком у моря', 5)).toBe('workation')
    expect(briefPersona({}, 'Хочу роскошный отель', 5)).toBe('luxury')
    expect(briefPersona({ budget: 200_000 }, 'на море', 5)).toBe('luxury')
    expect(briefPersona({}, 'Недорого, мы студенты', 5)).toBe('student')
    expect(briefPersona({ party: 'friends' }, 'с друзьями', 3)).toBe('student')
    expect(briefPersona({ budget: 20_000 }, 'в горы', 5)).toBe('student')
    expect(briefPersona({ party: 'couple' }, 'старинные города', 5)).toBe('culture')
  })
})
