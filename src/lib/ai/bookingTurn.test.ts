import type { LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { getHotel } from '../catalogGenerator'
import { stayTotal } from '../offer'
import { toolResultSchema, type ToolResult } from '../toolResult'
import type { TripBooking } from '../trips'
import type { AssistantRequest } from '../assistant'
import { runBookingsTool, runDateChangeTool } from './bookingTools'
import {
  answerAboutBookings,
  bookingTurn,
  isDateChangeRequest,
  mergePlans,
  readDateRange,
  rulesBookingPlan,
  type BookingTurnDeps,
} from './bookingTurn'

const TODAY = '2026-10-27'
const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const rate = room.rates[0]

const booking = (id: string, checkIn: string, checkOut: string, patch: Partial<TripBooking> = {}): TripBooking => ({
  id,
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'confirmed',
  hotelId: hotel.id,
  roomId: room.id,
  rateId: rate.id,
  checkIn,
  checkOut,
  guests: { adults: 2, children: 0, rooms: 1 },
  payment: 'at-hotel',
  total: stayTotal(rate.pricePerNight, checkIn, checkOut, 1),
  cancellation: rate.cancellation,
  ...patch,
})

const november = booking('OS-NOV001', '2026-11-10', '2026-11-12')
const december = booking('OS-DEC001', '2026-12-01', '2026-12-04')

const user = (text: string): AssistantRequest['messages'][number] => ({ role: 'user', text })

/** The deps of the turn: the hotel of the catalogue, the runs as the route makes them, no owner. */
const deps = (patch: Partial<BookingTurnDeps> = {}): BookingTurnDeps => ({
  hotels: async () => [hotel],
  models: undefined,
  record: async (_owner, _tool, _input, run) => ({ id: crypto.randomUUID(), result: await run() }),
  owner: async () => null,
  onError: () => {},
  ...patch,
})

const turn = (
  messages: AssistantRequest['messages'],
  bookings: TripBooking[],
  brief = {},
  patch: Partial<BookingTurnDeps> = {},
) =>
  bookingTurn(
    {
      messages,
      brief: { trips: true, ...brief },
      bookings,
      today: TODAY,
      deadline: Date.now() + 15_000,
      signal: new AbortController().signal,
    },
    deps(patch),
  )

const valid = (result: ToolResult) => expect(toolResultSchema.safeParse(result).success).toBe(true)

describe('readDateRange', () => {
  it('reads the named dates of a stay', () => {
    expect(readDateRange('Перенеси на 12–15 декабря', TODAY)).toEqual({ checkIn: '2026-12-12', checkOut: '2026-12-15' })
    expect(readDateRange('с 12 по 15 декабря', TODAY)).toEqual({ checkIn: '2026-12-12', checkOut: '2026-12-15' })
    expect(readDateRange('с 30 ноября по 3 декабря', TODAY)).toEqual({
      checkIn: '2026-11-30',
      checkOut: '2026-12-03',
    })
    expect(readDateRange('12.12–15.12', TODAY)).toEqual({ checkIn: '2026-12-12', checkOut: '2026-12-15' })
    // Эвал's own example: the short month and the year.
    expect(readDateRange('«17 – 19 нояб. 2026 г.»', TODAY)).toEqual({ checkIn: '2026-11-17', checkOut: '2026-11-19' })
  })

  it('takes a month already past as the next year', () => {
    expect(readDateRange('с 5 по 8 января', TODAY)).toEqual({ checkIn: '2027-01-05', checkOut: '2027-01-08' })
  })

  it('reads nothing of no stay', () => {
    expect(readDateRange('Какие условия отмены?', TODAY)).toBeNull()
    expect(readDateRange('с 15 по 12 декабря', TODAY)).toBeNull()
    expect(readDateRange('с 31 по 32 марта', TODAY)).toBeNull()
  })
})

describe('isDateChangeRequest', () => {
  it('knows the asks to move the dates', () => {
    for (const text of ['Хочу изменить даты', 'Перенеси бронь', 'Можно поменять дату заезда?', 'Сдвиньте на день'])
      expect(isDateChangeRequest(text), text).toBe(true)
    for (const text of ['Какие условия отмены?', 'Во сколько заезд?', 'Измени номер'])
      expect(isDateChangeRequest(text), text).toBe(false)
  })
})

describe('rulesBookingPlan', () => {
  it('takes the only upcoming booking, the one named, the one of the chat', () => {
    expect(rulesBookingPlan([user('Хочу изменить даты')], [november], {}, TODAY).bookingId).toBe('OS-NOV001')
    expect(rulesBookingPlan([user('Хочу изменить даты')], [november, december], {}, TODAY).bookingId).toBeNull()
    expect(rulesBookingPlan([user('Что с os-dec001?')], [november, december], {}, TODAY).bookingId).toBe('OS-DEC001')
    expect(
      rulesBookingPlan([user('Условия отмены?')], [november, december], { bookingId: 'OS-DEC001' }, TODAY).bookingId,
    ).toBe('OS-DEC001')
  })

  it('goes on with the change Эвал asked of: the booking and the dates of the dialog', () => {
    const plan = rulesBookingPlan(
      [
        user('Перенеси на 12–15 декабря'),
        { role: 'assistant', text: 'Какую бронь перенести? OS-NOV001 (…); OS-DEC001 (…).' },
        user('OS-DEC001'),
      ],
      [november, december],
      {},
      TODAY,
    )
    expect(plan).toEqual({
      action: 'change_dates',
      bookingId: 'OS-DEC001',
      dates: { checkIn: '2026-12-12', checkOut: '2026-12-15' },
    })
    const dates = rulesBookingPlan(
      [
        user('Хочу изменить даты'),
        { role: 'assistant', text: 'На какие даты перенести OS-DEC001 (…)?' },
        user('с 5 по 8 декабря'),
      ],
      [november, december],
      {},
      TODAY,
    )
    expect(dates).toMatchObject({ action: 'change_dates', bookingId: 'OS-DEC001' })
  })

  it('lets the traveller’s own number and dates win over the model', () => {
    const rules = rulesBookingPlan([user('OS-DEC001 на 12–15 декабря')], [november, december], {}, TODAY)
    const merged = mergePlans(
      rules,
      { action: 'details', bookingId: 'OS-NOV001', dates: { checkIn: '2026-12-13', checkOut: '2026-12-16' } },
      'OS-DEC001 на 12–15 декабря',
    )
    expect(merged).toEqual({
      action: 'change_dates',
      bookingId: 'OS-DEC001',
      dates: { checkIn: '2026-12-12', checkOut: '2026-12-15' },
    })
  })
})

describe('the tools', () => {
  it('«Бронирования» keeps to the contract and says nothing personal', () => {
    const result = runBookingsTool([november, december], new Map([[hotel.id, hotel]]), TODAY)
    valid(result)
    expect(result.groups?.map((g) => g.id)).toEqual(['OS-NOV001', 'OS-DEC001'])
    expect(result.claims.find((c) => c.id === 'OS-NOV001:hotel')?.value).toContain(hotel.name)
    // The catalogue is the only source; the booking's own record has none.
    expect(result.evidence.every((e) => e.entity_id === hotel.id)).toBe(true)
    expect(result.claims.find((c) => c.id === 'OS-NOV001:total')).toMatchObject({
      status: 'reported',
      evidence_ids: [],
    })
  })

  it('«Пересчёт при смене дат» counts as the checkout, or says why not', () => {
    const result = runDateChangeTool(november, hotel, '2026-11-13', '2026-11-15', TODAY)
    valid(result)
    expect(result.data?.change).toMatchObject({ total: stayTotal(rate.pricePerNight, '2026-11-13', '2026-11-15', 1) })
    expect(result.calculations.map((c) => c.name)).toContain('Цена проживания, как при бронировании')
    const past = runDateChangeTool(november, hotel, '2026-10-01', '2026-10-03', TODAY)
    valid(past)
    expect(past).toMatchObject({ status: 'error', summary: 'Дата заезда уже прошла' })
  })
})

describe('bookingTurn', () => {
  it('proposes the new dates with the price and the terms, to be confirmed', async () => {
    const answer = await turn([user('Перенеси бронь на 13–15 ноября')], [november])
    expect(answer.change).toMatchObject({
      bookingId: 'OS-NOV001',
      checkIn: '2026-11-13',
      checkOut: '2026-11-15',
      total: stayTotal(rate.pricePerNight, '2026-11-13', '2026-11-15', 1),
      from: { checkIn: '2026-11-10', checkOut: '2026-11-12', total: november.total },
    })
    expect(answer.reply).toMatch(/Подтвердить/)
    expect(answer.steps).toHaveLength(1)
    expect(answer.steps![0]).toMatchObject({ agent: 'trips', title: 'Пересчёт при смене дат', status: 'done' })
    valid(answer.steps![0].run!.result)
    expect(answer.brief).toEqual({ trips: true })
  })

  it('asks for the dates, or the booking, it lacks', async () => {
    expect((await turn([user('Хочу изменить даты')], [november])).reply).toMatch(/^На какие даты перенести OS-NOV001/)
    const which = await turn([user('Хочу изменить даты')], [november, december])
    expect(which.reply).toMatch(/^Какую бронь перенести\? OS-NOV001.*OS-DEC001/)
    expect(which.change).toBeUndefined()
  })

  it('answers a question from the run by the rules without a model', async () => {
    const answer = await turn([user('Какие условия отмены?')], [november, december], { bookingId: 'OS-DEC001' })
    expect(answer).toMatchObject({ source: 'rules', brief: { trips: true, bookingId: 'OS-DEC001' } })
    expect(answer.reply).toContain('OS-DEC001')
    expect(answer.reply).toContain('Условия отмены')
    expect(answer.steps![0]).toMatchObject({ title: 'Бронирования', params: 'OS-DEC001' })
  })

  it('takes the model’s reading of the message and its answer from the run', async () => {
    const replies = [{ action: 'change_dates', bookingId: 'OS-NOV001', checkIn: '2026-11-17', checkOut: '2026-11-19' }]
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(replies.shift() ?? { answer: 'ok' }) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    })
    const answer = await turn(
      [user('Сдвинь на неделю позже')],
      [november],
      {},
      {
        models: [{ id: 'm', model: model as LanguageModel, timeoutMs: 5000 }],
      },
    )
    expect(answer.change).toMatchObject({ checkIn: '2026-11-17', checkOut: '2026-11-19' })
    expect(answer.source).toBe('model')
  })

  it('fails an answer about the bookings with a conclusion the data do not have', async () => {
    const run = { result: runBookingsTool([november], new Map([[hotel.id, hotel]]), TODAY) }
    const saying = (answer: string) =>
      new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [{ type: 'text', text: JSON.stringify({ answer }) }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        }),
      }) as LanguageModel
    const ask = (answer: string) =>
      answerAboutBookings(saying(answer), [user('Что с бронью?')], run.result, AbortSignal.timeout(5000))
    await expect(ask('Бронь подтверждена. Обычно в отелях тихо, возьмите беруши.')).rejects.toThrow('беруш')
    await expect(ask('Бронь подтверждена.')).resolves.toBe('Бронь подтверждена.')
  })

  it('writes the run of a signed-in user with the number and the dates only', async () => {
    const record = vi.fn<BookingTurnDeps['record']>(async (_owner, _tool, _input, run) => ({
      id: crypto.randomUUID(),
      result: await run(),
    }))
    await turn([user('Перенеси на 13–15 ноября')], [november], {}, { record })
    expect(record).toHaveBeenCalledWith(
      null,
      'booking_date_change',
      'OS-NOV001 → 2026-11-13..2026-11-15',
      expect.any(Function),
    )
  })
})
