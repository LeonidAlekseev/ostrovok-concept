import { describe, expect, it } from 'vitest'
import { getHotel } from './catalog'
import {
  freeCancellationUntil,
  guruPrice,
  OFFER_NOT_FOUND,
  offerTotal,
  parseOffer,
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
  return parseOffer(params, TODAY)
}

describe('offerTotal', () => {
  it('multiplies the nightly price by nights and rooms', () => {
    expect(offerTotal(7000, 2, 2)).toBe(28_000)
  })
})

// hotel-catalog, Requirement: Цена GURU
describe('guruPrice', () => {
  it('takes 10 % off and rounds to the rouble', () => {
    expect(guruPrice(5985)).toBe(5387)
    expect(guruPrice(7000)).toBe(6300)
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
    expect(result.offer.total).toBe(rate.pricePerNight * 2)
  })

  it('prices several rooms', () => {
    const result = parse({ adults: '2', rooms: '2' })
    expect(result.ok && result.offer.total).toBe(rate.pricePerNight * 2 * 2)
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
