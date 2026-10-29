import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { cheapestRate } from './catalog'
import { getHotel } from './catalogGenerator'
import { parseStayParams } from './search'
import {
  averageNight,
  freeCancellationUntil,
  guruPrice,
  lowestPrice,
  nightPrice,
  OFFER_NOT_FOUND,
  parseOffer,
  stayTotal,
  toOfferParams,
  type OfferSelection,
} from './offer'

const TODAY = '2026-10-19'
const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const rate = room.rates[0]

const selection: OfferSelection = {
  hotelId: hotel.id,
  roomId: room.id,
  rateId: rate.id,
  checkIn: '2026-11-02',
  checkOut: '2026-11-04',
  guests: { adults: 2, children: 0, rooms: 1 },
}

const parse = (overrides: Record<string, string | null>) => {
  const params = toOfferParams(selection)
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  return parseOffer(params, TODAY, [hotel], destinations)
}

// hotel-catalog, Requirement: Цена предложения
describe('nightPrice', () => {
  it('is the rate price from Sunday to Thursday', () => {
    for (const date of ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'])
      expect(nightPrice(7000, date)).toBe(7000)
  })
  it('is 15 % more on Friday and Saturday, rounded up to 100 ₽', () => {
    expect(nightPrice(7000, '2026-10-23')).toBe(8100)
    expect(nightPrice(7000, '2026-10-24')).toBe(8100)
    expect(nightPrice(6000, '2026-10-23')).toBe(6900)
  })
})

describe('stayTotal', () => {
  it('multiplies weekday nights by rooms', () => {
    expect(stayTotal(7000, '2026-10-19', '2026-10-21', 2)).toBe(28_000)
  })
  it('sums Friday and Saturday nights at the weekend price', () => {
    expect(stayTotal(7000, '2026-10-23', '2026-10-25', 1)).toBe(16_200)
    expect(stayTotal(7000, '2026-10-22', '2026-10-24', 1)).toBe(15_100)
    expect(stayTotal(7000, '2026-10-22', '2026-10-24', 3)).toBe(45_300)
  })
  it('crosses months and years', () => {
    expect(stayTotal(7000, '2026-12-31', '2027-01-03', 1)).toBe(7000 + 8100 + 8100)
  })
})

describe('averageNight', () => {
  it('is the price of a night of one room, to the rouble', () => {
    expect(averageNight(45_300, 2, 3)).toBe(7550)
    expect(averageNight(23_200, 3, 1)).toBe(7733)
  })
})

// hotel-catalog, Requirement: Цена GURU
describe('guruPrice', () => {
  it('takes 10 % off and rounds to the rouble', () => {
    expect(guruPrice(5985)).toBe(5387)
    expect(guruPrice(7000)).toBe(6300)
  })
})

// hotel-page, Requirement: Панель цены
describe('lowestPrice', () => {
  const cheapest = cheapestRate(hotel).rate.pricePerNight
  const stay = { checkIn: '2026-10-23', checkOut: '2026-10-25', guests: { adults: 2, children: 0, rooms: 2 } }

  it('is the cheapest rate for the whole stay and all rooms', () => {
    expect(lowestPrice(hotel, stay, 2, TODAY)).toBe(stayTotal(cheapest, stay.checkIn, stay.checkOut, 2))
  })

  it('without dates is the cheapest night of the check-ins in the next 7 days, × rooms', () => {
    // From a Friday the week still has weekday nights, cheaper than Friday and Saturday.
    expect(lowestPrice(hotel, null, 1, '2026-10-23')).toBe(cheapest)
    expect(lowestPrice(hotel, null, 2, '2026-10-23')).toBe(cheapest * 2)
    // A hotel whose only night in the window were the weekend would cost the weekend price.
    expect(Math.min(nightPrice(cheapest, '2026-10-23'), nightPrice(cheapest, '2026-10-24'))).toBeGreaterThan(cheapest)
  })
})

describe('toOfferParams', () => {
  it('writes the offer and the stay like the search does', () => {
    expect(toOfferParams(selection).toString()).toBe(
      `hotel=${hotel.id}&room=${room.id}&rate=${rate.id}&checkin=2026-11-02&checkout=2026-11-04&adults=2&rooms=1`,
    )
    expect(toOfferParams({ ...selection, guests: { adults: 2, children: 1, rooms: 1 } }).get('children')).toBe('1')
  })
})

describe('parseOffer', () => {
  it('reads back what toOfferParams wrote', () => {
    const result = parse({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offer).toMatchObject({ ...selection, hotel, room, rate, nights: 2 })
    expect(result.offer.destination.id).toBe('prague')
    expect(result.offer.total).toBe(guruPrice(rate.pricePerNight * 2))
  })

  it('prices several rooms', () => {
    const result = parse({ adults: '2', rooms: '2' })
    expect(result.ok && result.offer.total).toBe(guruPrice(rate.pricePerNight * 2 * 2))
  })

  it('prices a Friday check-in at the weekend price', () => {
    const result = parse({ checkin: '2026-11-06', checkout: '2026-11-08' })
    expect(result.ok && result.offer.total).toBe(guruPrice(2 * nightPrice(rate.pricePerNight, '2026-11-06')))
    expect(result.ok && result.offer.total).toBeGreaterThan(guruPrice(rate.pricePerNight * 2))
  })

  it('costs what the hotel page shows as the GURU price of the cheapest rate', () => {
    const { room: cheapRoom, rate: cheapRate } = cheapestRate(hotel)
    const result = parseOffer(
      toOfferParams({ ...selection, roomId: cheapRoom.id, rateId: cheapRate.id }),
      TODAY,
      [hotel],
      destinations,
    )
    const stay = parseStayParams(toOfferParams({ ...selection, roomId: cheapRoom.id, rateId: cheapRate.id }))!
    expect(result.ok && result.offer.total).toBe(guruPrice(lowestPrice(hotel, stay, stay.guests.rooms, TODAY)))
  })

  it('rejects an unknown hotel, room or rate', () => {
    expect(parse({ hotel: 'nowhere' })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
    expect(parse({ room: 'penthouse' })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
    expect(parse({ hotel: null })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
  })

  it('rejects a rate of another room', () => {
    const other = hotel.rooms
      .flatMap((r) => r.rates.map((x) => ({ room: r, rate: x })))
      .find((x) => !room.rates.some((own) => own.id === x.rate.id))
    expect(other).toBeDefined()
    expect(parse({ rate: other!.rate.id })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
  })

  it('rejects malformed dates', () => {
    expect(parse({ checkin: '2026-13-01' })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
    expect(parse({ checkout: null })).toEqual({ ok: false, error: OFFER_NOT_FOUND })
  })

  it('checks dates and guests like the search', () => {
    expect(parse({ checkin: '2026-10-01' })).toEqual({ ok: false, error: 'Дата заезда уже прошла' })
    expect(parse({ checkout: '2026-11-02' })).toEqual({
      ok: false,
      error: 'Дата выезда должна быть позже даты заезда',
    })
    expect(parse({ adults: '1', rooms: '2' })).toEqual({
      ok: false,
      error: 'В каждом номере должен быть хотя бы один взрослый',
    })
    expect(parse({ adults: null })).toEqual({ ok: false, error: 'Проверьте количество гостей' })
    expect(parse({ children: 'two' })).toEqual({ ok: false, error: 'Проверьте количество гостей' })
  })
})

describe('freeCancellationUntil', () => {
  it('counts back from check-in, or is null for a non-refundable rate', () => {
    const free = { ...rate, cancellation: { kind: 'free' as const, daysBefore: 3 } }
    expect(freeCancellationUntil(free, '2026-11-02')).toBe('2026-10-30')
    expect(freeCancellationUntil({ ...rate, cancellation: { kind: 'non-refundable' } }, '2026-11-02')).toBeNull()
  })
})
