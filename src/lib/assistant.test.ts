import { afterEach, describe, expect, it, vi } from 'vitest'
import { stayTotal } from './offer'
import { hotels, newHotels } from './catalogGenerator'
import { destinations } from '../data/destinations'
import {
  askAssistant,
  describeBrief,
  foldBrief,
  makePlan,
  mergeBrief,
  missingNote,
  nextQuestion,
  normalizeBrief,
  parseWish,
  presetChips,
} from './assistant'

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

  // assistant-search, Requirement: Действия под ответом — «Другие варианты»
  it('skips the hotels the chat has shown for «Другие варианты»', () => {
    const brief = { destinationId: 'lisbon', when: 9, party: 'solo' as const }
    const city = hotels.filter((h) => h.destinationId === 'lisbon')
    const first = makePlan(brief, today, destinations, newHotels, city)
    const shown = new Set(first.options.flatMap((o) => (o.hotel ? [o.hotel.id] : [])))
    const more = makePlan(brief, today, destinations, newHotels, city, {}, shown)
    expect(more.options.length).toBeGreaterThan(0)
    expect(more.options.every((o) => o.hotel && !shown.has(o.hotel.id))).toBe(true)
  })

  // assistant-search, Requirement: Карточки отелей в ответе
  it('gives a hotel the views of its room names, and none without data', () => {
    const brief = { destinationId: 'lisbon', when: 9, party: 'solo' as const }
    const [hotel, other] = hotels.filter((h) => h.destinationId === 'lisbon')
    const features = {
      [hotel.id]: {
        views: [
          { roomName: 'Номер с видом на улицу', view: 'street' as const },
          { roomName: 'Люкс с видом на море', view: 'sea' as const },
          { roomName: 'Делюкс с видом на море', view: 'sea' as const },
        ],
      },
    }
    const plan = makePlan(brief, today, destinations, newHotels, [hotel, other], features)
    expect(plan.options.find((o) => o.hotel?.id === hotel.id)?.views).toEqual(['sea', 'street'])
    expect(plan.options.find((o) => o.hotel?.id === other.id)).not.toHaveProperty('views')
  })

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

describe('the assistant’s own pick among the cities shown', () => {
  const today = '2026-10-19'
  const valencia = destinations.filter((d) => d.id === 'valencia')

  it('plans Valencia for a winter «Удиви меня» in production (Scenario: Зима в production)', () => {
    const plan = makePlan({ vibe: 'any', when: 'any', party: 'any' }, today, valencia, [])
    expect(plan.options.length).toBeGreaterThan(0)
    for (const o of plan.options) expect(o.destination.id).toBe('valencia')
    expect(plan.why).not.toBe('')
  })

  it('keeps the seasonal favourite when it has a city shown', () => {
    const shown = destinations.filter((d) => ['paris', 'valencia'].includes(d.id))
    const plan = makePlan({ vibe: 'any', when: 0, party: 'couple' }, today, shown, [])
    expect(plan.why).toBe(
      'Выбрал сам: вдвоём лучше всего там, где красиво. Значит, город, в который влюбляешься вдвоём.',
    )
    for (const o of plan.options) expect(o.destination.id).toBe('paris')
  })

  it('takes the shown cities without a theme when no theme has one', () => {
    const plain = { ...valencia[0], id: 'plain-city', scenarios: ['weekend' as const] }
    const plan = makePlan({ vibe: 'any', when: 'any', party: 'any' }, today, [plain], [])
    expect(plan.options.map((o) => o.destination.id)).toEqual(['plain-city'])
    expect(plan.why).toBe('Смена картинки без долгого перелёта.')
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

// assistant-search, Requirement: Подбор по свойствам здания и окружения
describe('the hotel criteria', () => {
  it('reads a quiet night, the building’s height and the view', () => {
    expect(parseWish('тихий отель в Валенсии, чтобы ночью не шумело', destinations)).toMatchObject({ quiet: true })
    expect(parseWish('а повыше?', destinations)).toEqual({ height: 'high' })
    expect(parseWish('а пониже, на нижних этажах', destinations)).toEqual({ height: 'low' })
    expect(parseWish('номер с видом на море', destinations)).toMatchObject({ view: 'sea', vibe: 'sea' })
    expect(parseWish('чтобы был красивый вид из окна', destinations)).toMatchObject({ view: 'any' })
    expect(parseWish('хочу на море в октябре', destinations).view).toBeUndefined()
  })

  it('keeps the earlier conditions of the chat on a refinement (Scenario: Уточнение)', () => {
    const quiet = mergeBrief({}, 'тихий отель в Лиссабоне в октябре, один', null, destinations)
    expect(quiet).toMatchObject({ destinationId: 'lisbon', quiet: true, when: 9, party: 'solo' })
    const higher = mergeBrief(quiet, 'а повыше?', null, destinations)
    expect(higher).toEqual({ ...quiet, height: 'high' })
    expect(describeBrief(higher, destinations)).toBe(
      'Лиссабон · спокойно · в октябре · один · тихо ночью · здание повыше',
    )
  })

  it('explains a hotel without the data honestly (Scenario: Нет данных)', () => {
    const brief = { destinationId: 'prague', when: 9, party: 'solo' as const, quiet: true as const }
    const plan = makePlan(brief, '2026-10-01', destinations, newHotels)
    expect(plan.options.length).toBeGreaterThan(0)
    for (const option of plan.options) expect(option.reasons).toEqual(['нет данных о шуме'])
    const prague = destinations.filter((d) => d.id === 'prague')
    expect(missingNote(['quiet'], prague)).toBe('Данных о шуме у отелей Праги нет — подобрал без этого условия.')
    expect(missingNote([], prague)).toBe('')
  })
})

// assistant-search, Requirement: Начальный экран
describe('the presets of Eval', () => {
  const valencia = destinations.filter((d) => d.id === 'valencia')

  it('offers only the themes with a city shown in the season (Scenario: Пресеты без видимых городов)', () => {
    // Production shows Valencia only: no mountains; the sea only outside winter.
    expect(presetChips(valencia, '2026-06-01').map((c) => c.label)).toEqual([
      'На море',
      'В город',
      'С детьми',
      'Куда угодно',
    ])
    expect(presetChips(valencia, '2026-11-20').map((c) => c.label)).toEqual(['В город', 'С детьми', 'Куда угодно'])
    expect(presetChips(destinations, '2026-11-20').map((c) => c.label)).toEqual([
      'На море',
      'В горы',
      'В город',
      'С детьми',
      'Куда угодно',
    ])
  })

  it('hands the theme to Eval on «Куда угодно» and asks the party on «С детьми» (Scenario: Куда угодно)', () => {
    expect(mergeBrief({}, 'Куда угодно', null, destinations).vibe).toBe('any')
    expect(mergeBrief({}, 'В город', null, destinations).vibe).toBe('europe')
    const kids = mergeBrief({}, 'С детьми', null, destinations)
    expect(kids.party).toBe('family')
    expect(kids.vibe).toBeUndefined()
  })

  it('leaves out the quick replies without a city', () => {
    expect(nextQuestion({}, '2026-06-01', valencia)?.replies).toEqual(['На море', 'Города Европы', 'Удиви меня'])
    expect(nextQuestion({}, '2026-06-01')?.replies).toEqual([
      'На море',
      'В горы',
      'Города Европы',
      'Романтика',
      'Удиви меня',
    ])
  })
})

// assistant-exact-dates, Requirement: Разбор пожелания (named days of the stay)
describe('named days of the stay', () => {
  const today = '2026-10-24'
  const dates = { checkIn: '2026-11-10', checkOut: '2026-11-15' }

  it('plans the named days and their length (Scenario: Конкретные даты)', () => {
    const plan = makePlan(
      { destinationId: 'valencia', dates, when: 10, nights: 5, party: 'couple' },
      today,
      destinations,
      newHotels,
    )
    expect(plan.query).toMatchObject({ checkIn: '2026-11-10', checkOut: '2026-11-15' })
    expect(plan.nights).toBe(5)
  })

  it('takes the named days over the month and the length of the rules', () => {
    const plan = makePlan({ vibe: 'sea', dates, when: 10, nights: 2, party: 'solo' }, today, destinations, newHotels)
    expect(plan.query).toMatchObject({ checkIn: '2026-11-10', checkOut: '2026-11-15' })
    expect(plan.nights).toBe(5)
  })

  it('keeps the plan by the month without named days', () => {
    const plan = makePlan({ vibe: 'sea', when: 10, party: 'solo' }, today, destinations, newHotels)
    expect(plan.query.checkIn).toBe('2026-11-07')
  })

  it('keeps the other conditions when the check-in moves (Scenario: Уточнение дат)', () => {
    const brief = { destinationId: 'valencia', party: 'couple', dates, when: 10, nights: 5, budget: 90_000 } as const
    const moved = foldBrief(
      brief,
      { dates: { checkIn: '2026-11-12', checkOut: '2026-11-17' }, when: 10, nights: 5 },
      'а с 12-го?',
      'when',
    )
    expect(moved).toEqual({ ...brief, dates: { checkIn: '2026-11-12', checkOut: '2026-11-17' } })
  })

  it('drops the named days on "не важно" for the dates asked', () => {
    const brief = { vibe: 'sea' as const, dates, when: 10, nights: 5 }
    expect(foldBrief(brief, {}, 'не важно', 'dates')).toEqual({ vibe: 'sea', when: 10, nights: 5 })
  })

  it('replaces the named days by a month of its own', () => {
    const brief = { vibe: 'sea' as const, dates, when: 10, nights: 5 }
    expect(mergeBrief(brief, 'в декабре', 'when', destinations)).toEqual({ vibe: 'sea', when: 11, nights: 5 })
  })

  it('asks for the dates when the named ones have passed', () => {
    const question = nextQuestion({ vibe: 'sea', dates: { checkIn: '2026-10-10', checkOut: '2026-10-15' } }, today)
    expect(question?.id).toBe('dates')
    expect(question?.replies).toEqual([])
  })

  it('asks for the dates when the model could not take them', () => {
    expect(nextQuestion({ vibe: 'sea', when: 10, datesRejected: true }, today)?.id).toBe('dates')
    expect(nextQuestion({ vibe: 'sea', when: 10, dates }, today)?.id).toBe('party')
  })

  it('shows the named days in the brief', () => {
    expect(describeBrief({ destinationId: 'valencia', dates, when: 10, nights: 5 }, destinations)).toBe(
      'Валенсия · 10 нояб. — 15 нояб. · 5 ночей',
    )
  })

  // assistant-search, Requirement: Вопрос об отеле
  it('keeps the hotel of the chat only as a short string', () => {
    expect(normalizeBrief({ hotelId: 'ota-1' }, destinations)).toEqual({ hotelId: 'ota-1' })
    expect(normalizeBrief({ hotelId: '' }, destinations)).toEqual({})
    expect(normalizeBrief({ hotelId: 7 }, destinations)).toEqual({})
    expect(normalizeBrief({ hotelId: 'x'.repeat(121) }, destinations)).toEqual({})
  })

  it('keeps only real days of at most a month of nights from the client', () => {
    expect(normalizeBrief({ dates: { checkIn: '2026-02-31', checkOut: '2026-03-02' } }, destinations)).toEqual({})
    expect(normalizeBrief({ dates: { checkIn: '2026-11-15', checkOut: '2026-11-10' } }, destinations)).toEqual({})
    expect(normalizeBrief({ dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' } }, destinations)).toEqual({
      dates,
      when: 10,
      nights: 5,
    })
  })
})

// assistant-search, Requirement: Что сделать с фото
describe('askAssistant with photos', () => {
  const photo = 'data:image/webp;base64,AAAA'
  const request = { messages: [{ role: 'user' as const, text: 'Фото' }], brief: {}, photos: [photo, photo] }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the photos and reads the answer about them', async () => {
    const fetch = vi.fn(async () => Response.json({ brief: {}, source: 'rules', photo: { action: 'ask' } }))
    vi.stubGlobal('fetch', fetch)
    const response = await askAssistant(request, null, destinations)
    expect(response.photo).toEqual({ action: 'ask' })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).photos).toEqual([photo, photo])
  })

  it('keeps the answer’s known actions only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ brief: {}, source: 'model', photo: { action: 'paint', seen: 1 } })),
    )
    expect((await askAssistant(request, null, destinations)).photo).toBeUndefined()
  })

  it('says it could not look at the photos when the route fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    )
    expect(await askAssistant(request, null, destinations)).toEqual({
      brief: {},
      source: 'rules',
      photo: { action: 'unseen' },
    })
  })

  it('sends no photos field without photos', async () => {
    const fetch = vi.fn(async () => Response.json({ brief: {}, source: 'rules' }))
    vi.stubGlobal('fetch', fetch)
    await askAssistant({ ...request, photos: [] }, null, destinations)
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('photos')
  })
})
