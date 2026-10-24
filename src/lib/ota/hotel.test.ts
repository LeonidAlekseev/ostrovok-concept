import { describe, expect, it } from 'vitest'
import { cheapestRate, hasStars, isRated } from '../catalog'
import { otaHotel, searchStay, type OtaStay } from './hotel'
import { ostrovokImage } from './image'
import { otaHotelSchema, otaSearchSchema, type OtaHotel, type OtaRate } from './search'

const TMPL = 'https://cdn.ostrovok.ru/t/{size}/content/dd/97/dd97bc3886ae2e47f5c8fde4478e14f215fbc6bc.jpeg'
const STAY: OtaStay = { checkIn: '2026-11-05T00:00:00Z', nights: 3 }

function rate(perNight: number, extra: { free?: string; meal?: string; rg?: string; size?: number } = {}): OtaRate {
  return {
    occupancy: 2,
    payment_options: {
      payment_types: [{ type: 'now', amount: perNight * 3, average_show_price_per_day: perNight }],
    },
    cancellation_info: {
      policies: [{ end_at: extra.free ?? null }, { end_at: '2026-11-05T00:00:00Z' }],
      free_cancellation_before: extra.free ?? null,
    },
    rooms: [
      {
        rg_hash: extra.rg ?? '3102302',
        room_name: 'Двухместный номер Cosy (двуспальная кровать)',
        room_data_trans: { ru: { main_name: 'Двухместный номер Cosy', bedding_type: 'двуспальная кровать' } },
        meal: [extra.meal ?? 'nomeal'],
        size: extra.size ?? null,
      },
    ],
  }
}

function raw(vm: Partial<OtaHotel['static_vm']> = {}, rates: OtaRate[] = [rate(11779)]): OtaHotel {
  return {
    master_id: 9322089,
    ota_hotel_id: 'hotel_malcom_and_barret',
    static_vm: {
      name: 'Отель Malcom and Barret',
      address: 'Av Ausias March 59, Валенсия',
      latitude: 39.4507,
      longitude: -0.370971,
      kind: 'Hotel',
      star_rating: 30,
      rating_total: 9.2,
      rating: { count: 3567 },
      images: [{ tmpl: TMPL }, { tmpl: TMPL.replace('dd97bc', 'aa11bc') }],
      nearest_subways: [
        { name: 'Амадо Гранелл Монтоливет', distance: 1106 },
        { name: 'Куатре Карререс', distance: 963 },
      ],
      serp_filters: ['has_internet', 'has_parking', 'has_busyness', 'air-conditioning'],
      room_groups: [{ rg_hash: '3102302', name_struct: { main_name: 'Двухместный номер Cosy' } }],
      search_region_center_distance: 2.1762142,
      ...vm,
    },
    rates,
  }
}

describe('otaHotel', () => {
  it('keeps the real summary under the id of the master id', () => {
    const hotel = otaHotel(raw(), 'valencia', STAY)
    expect(hotel).toMatchObject({
      id: 'ota-9322089',
      destinationId: 'valencia',
      name: 'Отель Malcom and Barret',
      stayType: 'hotel',
      stars: 3,
      rating: 9.2,
      reviewCount: 3567,
      priceFrom: 11800,
      address: 'Av Ausias March 59, Валенсия',
      lat: 39.4507,
      lon: -0.370971,
      distanceKm: 2.2,
      metro: { station: 'Куатре Карререс', meters: 960 },
      amenities: ['wifi', 'air-conditioning', 'parking'],
      isNew: false,
    })
    expect(hotel.description).toMatch(/^Отель Malcom and Barret — 3-звёздочный отель в 2,2 км от центра Валенсии\./)
  })

  it('has no generated reviews, section scores or guest photos, rated or not', () => {
    const hotel = otaHotel(raw(), 'valencia', STAY)
    expect(hotel).toMatchObject({ rating: 9.2, reviewCount: 3567, sectionScores: [], reviews: [], guestPhotos: [] })
  })

  it('lists every room type: the priced ones first, the others without rates or a guess at the guests', () => {
    const groups = ['a', 'b', 'c', 'd'].map((rg) => ({ rg_hash: rg, name_struct: { main_name: `Номер ${rg}` } }))
    const hotel = otaHotel(
      raw({ room_groups: groups }, [rate(14020, { rg: 'c' }), rate(11779, { rg: 'a' })]),
      'valencia',
      STAY,
    )
    expect(hotel.rooms.map((r) => [r.id, r.rates.length])).toEqual([
      ['room-a', 1],
      ['room-c', 1],
      ['room-b', 0],
      ['room-d', 0],
    ])
    expect(hotel.rooms[2]).toMatchObject({ name: 'Номер b', area: null, capacity: 0 })
    expect(cheapestRate(hotel).room.id).toBe('room-a')
  })

  it('reads the stars ×10, and a hotel without them shows none', () => {
    expect(otaHotel(raw({ star_rating: 40 }), 'valencia', STAY).stars).toBe(4)
    const unrated = otaHotel(raw({ star_rating: undefined }), 'valencia', STAY)
    expect(unrated.stars).toBe(0)
    expect(hasStars(unrated)).toBe(false)
    expect(unrated.description).toMatch(/— отель в /)
  })

  it.each([
    ['Hostel', 'hostel'],
    ['Aparthotel', 'apartments'],
    ['Cottages_and_Houses', 'apartments'],
    ['Villas_and_Bungalows', 'villa'],
    ['Boutique_and_Design', 'hotel'],
    ['Guesthouse', 'hotel'],
  ] as const)('makes the kind %s a %s', (kind, stayType) => {
    expect(otaHotel(raw({ kind }), 'valencia', STAY).stayType).toBe(stayType)
  })

  it('prices a night from the average of the stay, rounded up to 100 ₽, and sells the rate as it is', () => {
    const hotel = otaHotel(
      raw({}, [rate(14020, { rg: 'b', free: '2026-11-02T22:59:00Z', meal: 'breakfast', size: 21.6 }), rate(11779)]),
      'valencia',
      STAY,
    )
    expect(hotel.priceFrom).toBe(11800)
    expect(cheapestRate(hotel).rate.pricePerNight).toBe(hotel.priceFrom)
    expect(hotel.rooms.map((r) => r.rates[0].pricePerNight)).toEqual([11800, 14100])
    expect(hotel.rooms[0]).toMatchObject({
      name: 'Двухместный номер Cosy',
      beds: 'двуспальная кровать',
      area: null,
      capacity: 2,
      rates: [{ meal: 'none', cancellation: { kind: 'non-refundable' }, payment: 'now' }],
    })
    // 2.04 days before the check-in: the free cancellation ends 3 days before, never later than the real one.
    expect(hotel.rooms[1]).toMatchObject({
      area: 22,
      rates: [{ meal: 'breakfast', cancellation: { kind: 'free', daysBefore: 3 } }],
    })
  })

  it('takes every photo from the CDN template', () => {
    const { photos } = otaHotel(raw(), 'valencia', STAY)
    expect(photos.map((p) => p.url)).toEqual([TMPL, TMPL.replace('dd97bc', 'aa11bc')])
    expect(ostrovokImage(photos[0].url!, '640x400')).toBe(
      'https://cdn.ostrovok.ru/t/640x400/content/dd/97/dd97bc3886ae2e47f5c8fde4478e14f215fbc6bc.jpeg',
    )
  })

  it('keeps the generated placeholders of a hotel without images', () => {
    const { photos } = otaHotel(raw({ images: [] }), 'valencia', STAY)
    expect(photos.length).toBeGreaterThanOrEqual(12)
    expect(photos.every((p) => p.url === undefined)).toBe(true)
  })

  it('prices a hotel without rates by its map pin: the stay divided by its nights', () => {
    const hotel = otaHotel(raw({}, []), 'valencia', STAY, { master_id: 9322089, price: 35337 })
    expect(hotel.priceFrom).toBe(11800)
    expect(hotel.rooms).toHaveLength(1)
    const [first, ...rest] = otaHotel(
      raw(
        {
          room_groups: [
            { rg_hash: 'a', name_struct: { main_name: 'A' } },
            { rg_hash: 'b', name_struct: { main_name: 'B' } },
          ],
        },
        [],
      ),
      'valencia',
      STAY,
      { master_id: 9322089, price: 35337 },
    ).rooms
    expect([first.rates.length, rest.map((r) => r.rates.length)]).toEqual([1, [0]])
    expect(cheapestRate(hotel).rate).toMatchObject({ pricePerNight: 11800, cancellation: { kind: 'non-refundable' } })
    expect(() => otaHotel(raw({}, []), 'valencia', STAY)).toThrow(/neither a rate nor a map pin/)
  })

  it('gives a hotel nobody has rated no score, no reviews and no guest photos', () => {
    const hotel = otaHotel(raw({ rating_total: undefined, rating: {} }), 'valencia', STAY)
    expect(isRated(hotel)).toBe(false)
    expect(hotel).toMatchObject({ rating: 0, reviewCount: 0, sectionScores: [], reviews: [], guestPhotos: [] })
  })

  it('is the same on every run', () => {
    expect(otaHotel(raw(), 'valencia', STAY)).toEqual(otaHotel(raw(), 'valencia', STAY))
  })
})

describe('searchStay', () => {
  it('finds the check-in where the policies end and the nights of the prices', () => {
    expect(searchStay({ hotels: [raw({}, [rate(11779, { free: '2026-11-02T22:59:00Z' }), rate(5000)])] })).toEqual(STAY)
  })
})

describe('otaSearchSchema', () => {
  it('rejects a photo without the size in its template', () => {
    const hotel = raw({ images: [{ tmpl: 'https://cdn.ostrovok.ru/t/640x400/x.jpeg' }] })
    expect(otaHotelSchema.safeParse(hotel).success).toBe(false)
    expect(otaSearchSchema.safeParse({ hotels: [raw()], map_hotels: [] }).success).toBe(true)
  })
})
