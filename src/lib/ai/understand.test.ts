import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import type { Brief } from '@/lib/assistant'
import { understandWish } from './understand'
import { PHRASES } from './understand.phrases'

const today = '2026-10-24'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}

/** The model's answer with the fields it left out as null, as the schema asks. */
const answer = (fields: Record<string, unknown>) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        destinationId: null,
        vibe: null,
        when: null,
        checkIn: null,
        checkOut: null,
        nights: null,
        party: null,
        mood: null,
        budget: null,
        reply: 'Записал!',
        ...fields,
      }),
    },
  ],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
})

/** Reads `text` after `brief` with a model that answers `fields`. */
function read(text: string, fields: Record<string, unknown>, brief: Brief = {}) {
  const model = new MockLanguageModelV4({ doGenerate: answer(fields) })
  return understandWish(model, { messages: [{ role: 'user', text }], brief }, today, destinations)
}

describe('understandWish: named days', () => {
  it('takes the days and the length of «с 10 по 15 ноября»', async () => {
    const { parsed } = await read('тихий отель в Валенсии с 10 по 15 ноября, вдвоём', {
      destinationId: 'valencia',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      party: 'couple',
    })
    expect(parsed).toEqual({
      destinationId: 'valencia',
      party: 'couple',
      dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' },
      when: 10,
      nights: 5,
    })
  })

  it('moves the check-in and keeps the length of the stay for «а с 12-го?»', async () => {
    const brief: Brief = {
      destinationId: 'valencia',
      party: 'couple',
      dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' },
      when: 10,
      nights: 5,
    }
    const { parsed } = await read('а с 12-го?', { checkIn: '2026-11-12' }, brief)
    expect(parsed).toEqual({ dates: { checkIn: '2026-11-12', checkOut: '2026-11-17' }, when: 10, nights: 5 })
  })

  it('moves the check-out of the stay for a new length of it', async () => {
    const brief: Brief = { dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' }, when: 10, nights: 5 }
    const { parsed } = await read('на 3 ночи', { nights: 3 }, brief)
    expect(parsed).toEqual({ dates: { checkIn: '2026-11-10', checkOut: '2026-11-13' }, when: 10, nights: 3 })
  })

  it('asks for the days when the named ones are past', async () => {
    const { parsed } = await read('в Валенсии с 10 по 15 октября', { checkIn: '2026-10-10', checkOut: '2026-10-15' })
    expect(parsed).toEqual({ datesRejected: true })
  })

  it('asks for the days when they are impossible or too long', async () => {
    expect((await read('с 31 февраля по 2 марта', { checkIn: '2027-02-31', checkOut: '2027-03-02' })).parsed).toEqual({
      datesRejected: true,
    })
    expect((await read('с 1 ноября по 1 января', { checkIn: '2026-11-01', checkOut: '2027-01-01' })).parsed).toEqual({
      datesRejected: true,
    })
  })

  it('asks for the days when only the check-in is named and the length is not known', async () => {
    const { parsed } = await read('с 12 ноября', { checkIn: '2026-11-12' })
    expect(parsed).toEqual({ datesRejected: true })
  })

  it('takes no days the message does not name', async () => {
    const { parsed } = await read('тихий отель в Валенсии, вдвоём', {
      destinationId: 'valencia',
      checkIn: '2026-11-10',
      checkOut: '2026-11-15',
      party: 'couple',
    })
    expect(parsed).toEqual({ destinationId: 'valencia', party: 'couple' })
  })
})

describe('understandWish: the remark', () => {
  it('keeps a Russian remark with a Latin name', async () => {
    const { reply } = await read('Валенсия', { reply: 'Записал, Hotel Palace — хороший выбор!' })
    expect(reply).toBe('Записал, Hotel Palace — хороший выбор!')
  })

  it('drops a remark in English or in another script', async () => {
    expect((await read('Валенсия', { reply: 'Got it, noted!' })).reply).toBeUndefined()
    expect((await read('Валенсия', { reply: 'Записал 好的' })).reply).toBeUndefined()
    // A question to something the message said («вдвоём») is not a remark: the code asks what the brief lacks.
    expect((await read('Тихо, вдвоём', { reply: 'Сколько человек поедет?' })).reply).toBeUndefined()
  })
})

describe('understandWish: city, days and guests on the first try', () => {
  it('keeps who goes said by a count, which the rules do not read', async () => {
    for (const [text, party] of [
      ['Отель в Праге 12–16 ноября, нас двое', 'couple'],
      ['Валенсия, 10-15 ноября, двое взрослых', 'couple'],
      ['Для меня одного номер в Осло, 2–5 декабря', 'solo'],
    ] as const) {
      const { parsed } = await read(text, { party })
      expect(parsed.party, text).toBe(party)
    }
  })

  it('still drops a guest the message never mentions', async () => {
    const { parsed } = await read('Отель в Праге 12–16 ноября', { party: 'couple' })
    expect(parsed.party).toBeUndefined()
  })

  it('reads the days of «12–16 ноября» without «по»', async () => {
    const { parsed } = await read('Отель в Праге 12–16 ноября, нас двое', {
      destinationId: 'prague',
      checkIn: '2026-11-12',
      checkOut: '2026-11-16',
      party: 'couple',
    })
    expect(parsed).toMatchObject({
      destinationId: 'prague',
      dates: { checkIn: '2026-11-12', checkOut: '2026-11-16' },
      party: 'couple',
    })
  })

  it('gives the model the examples of the days, the guests and the city cases', async () => {
    const model = new MockLanguageModelV4({ doGenerate: answer({}) })
    await understandWish(
      model,
      { messages: [{ role: 'user', text: 'Тихий отель в Валенсии с 10 по 15 ноября вдвоём' }], brief: {} },
      today,
      destinations,
    )
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt)
    expect(prompt).toContain('12–16 ноября')
    expect(prompt).toContain('нас двое')
    expect(prompt).toContain('в любом падеже')
  })
})

describe('understandWish: the phrase set', () => {
  it.each(PHRASES)('keeps what the model read from «$text»', async ({ text, ...want }) => {
    const { parsed } = await read(text, {
      destinationId: want.destinationId,
      checkIn: want.checkIn,
      checkOut: want.checkOut,
      party: want.party,
      budget: want.budget,
      nights: want.nights,
    })
    expect(parsed.destinationId).toBe(want.destinationId)
    expect(parsed.dates).toEqual({ checkIn: want.checkIn, checkOut: want.checkOut })
    if (want.party) expect(parsed.party).toBe(want.party)
    if (want.budget) expect(parsed.budget).toBe(want.budget)
  })
})

describe('understandWish: the budget and the theme', () => {
  const phrase =
    'Найди в Валенсии отель, где на фото номер с большой ванной и балконом, 20-23 ноября, вдвоём, до 200 евро за ночь'

  it('turns euros per night into rubles itself, and does not guess the sea', async () => {
    const { parsed } = await read(phrase, {
      destinationId: 'valencia',
      vibe: 'sea',
      checkIn: '2026-11-20',
      checkOut: '2026-11-23',
      party: 'couple',
      budget: 2_000_000,
      budgetCurrency: 'rub',
    })
    expect(parsed.budgetPerNight).toBe(18_000)
    expect(parsed.budget).toBeUndefined()
    expect(parsed.vibe).toBeUndefined()
    expect(parsed.destinationId).toBe('valencia')
  })

  it('takes the amount and the currency the model read when the rules see no sum', async () => {
    const { parsed } = await read('отель в Валенсии, двести евро за ночь', {
      destinationId: 'valencia',
      budget: 200,
      budgetCurrency: 'eur',
      budgetPer: 'night',
    })
    expect(parsed.budgetPerNight).toBe(18_000)
  })
})
