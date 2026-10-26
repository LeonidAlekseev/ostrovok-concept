import {
  AMENITIES,
  PHOTO_TONE_COUNT,
  REAL_HOTEL_ID_PREFIX,
  roundUp100,
  type Amenity,
  type Cancellation,
  type Hotel,
  type HotelSummary,
  type Meal,
  type Photo,
  type Rate,
  type Room,
  type StayType,
} from '../catalog'
import { generateHotel } from '../catalogGenerator'
import type { OtaHotel, OtaMapHotel, OtaRate, OtaSearch } from './search'

/**
 * A hotel of an Ostrovok search as a catalogue `Hotel`: the name, the address, the place, the stars, the
 * rating, the price, the photos, the amenities, the room with its rate and the review count are real; the
 * description, the check-in and check-out times and the workspace come from the hotel's Ostrovok page
 * (`OtaPageFields`, src/lib/ota/page.ts). The Wi‑Fi speed is unknown (`null`): neither has it. The reviews, the
 * section scores and the guests' photos are never generated; the page's are `HotelDetails`, read apart.
 */

/** What the hotel's Ostrovok page gives its catalogue row. */
export interface OtaPageFields {
  description: string
  checkIn: string | null
  checkOut: string | null
  workspace: boolean
}

/** The search's stay: its check-in (an instant) and its length, which the prices of the search are for. */
export interface OtaStay {
  checkIn: string
  nights: number
}

const DAY_MS = 86_400_000

/**
 * The stay of a search, from its rates: the cancellation policies end at the check-in, and the price of the
 * whole stay is that many nights of the average price.
 */
export function searchStay(search: Pick<OtaSearch, 'hotels'>): OtaStay {
  const rates = search.hotels.flatMap((h) => h.rates)
  const ends = rates.flatMap((r) => r.cancellation_info.policies.map((p) => p.end_at)).filter((end) => end !== null)
  if (!ends.length) throw new Error('ota: no cancellation policy ends at the check-in')
  const checkIn = ends.reduce((latest, end) => (Date.parse(end) > Date.parse(latest) ? end : latest))
  const nights = new Set(
    rates.map((r) => {
      const { amount, average_show_price_per_day } = r.payment_options.payment_types[0]
      return Math.round(amount / average_show_price_per_day)
    }),
  )
  if (nights.size !== 1) throw new Error(`ota: the rates are for different stays: ${[...nights].join(', ')} nights`)
  return { checkIn, nights: [...nights][0] }
}

export const otaHotelId = (masterId: number) => `${REAL_HOTEL_ID_PREFIX}${masterId}`

const STAY_TYPE_OF_KIND: Record<string, StayType> = {
  Hostel: 'hostel',
  Aparthotel: 'apartments',
  Cottages_and_Houses: 'apartments',
  Villas_and_Bungalows: 'villa',
}

/** The search's filters of a hotel as the catalogue's amenities; the ones the catalogue has no key for are skipped. */
const AMENITY_OF_FILTER: Record<string, Amenity> = {
  has_internet: 'wifi',
  'air-conditioning': 'air-conditioning',
  has_meal: 'restaurant',
  has_airport_transfer: 'shuttle',
  has_parking: 'parking',
  has_pool: 'pool',
  has_fitness: 'gym',
  has_spa: 'spa',
  has_disabled_support: 'accessible',
  has_kids: 'family',
  has_pets: 'pets',
}
const amenityOrder = new Map((Object.keys(AMENITIES) as Amenity[]).map((key, index) => [key, index]))

const MEAL_OF: Record<string, Meal> = {
  nomeal: 'none',
  breakfast: 'breakfast',
  'half-board': 'half-board',
  'full-board': 'full-board',
  'all-inclusive': 'all-inclusive',
}

const pricePerNight = (rate: OtaRate) => roundUp100(rate.payment_options.payment_types[0].average_show_price_per_day)

function cancellationOf(rate: OtaRate, stay: OtaStay): Cancellation {
  const before = rate.cancellation_info.free_cancellation_before
  if (!before) return { kind: 'non-refundable' }
  // Whole days before the check-in, rounded up: the free cancellation never outlasts the real one.
  return { kind: 'free', daysBefore: Math.max(1, Math.ceil((Date.parse(stay.checkIn) - Date.parse(before)) / DAY_MS)) }
}

const roomPhotos = (name: string): Photo[] => [{ id: 'room-1', caption: name, tone: 0 }]

/** The rooms of the rates, each with its rates cheapest first, the cheapest room first. */
function roomsOf(raw: OtaHotel, stay: OtaStay): Room[] {
  const rooms = new Map<string, Room>()
  raw.rates.forEach((rate, index) => {
    const room = rate.rooms[0]
    const group = raw.static_vm.room_groups.find((g) => g.rg_hash === room.rg_hash)
    const name = room.room_data_trans?.ru.main_name ?? group?.name_struct.main_name ?? room.room_name
    const id = `room-${room.rg_hash}`
    const entry = rooms.get(id) ?? {
      id,
      name,
      area: room.size ? Math.round(room.size) : null,
      beds: room.room_data_trans?.ru.bedding_type ?? group?.name_struct.bedding_type ?? '',
      capacity: rate.occupancy,
      photos: roomPhotos(name),
      rates: [],
    }
    entry.rates.push({
      id: `rate-${index + 1}`,
      meal: MEAL_OF[room.meal[0]] ?? 'none',
      cancellation: cancellationOf(rate, stay),
      payment: rate.payment_options.payment_types[0].type === 'hotel' ? 'at-hotel' : 'now',
      pricePerNight: pricePerNight(rate),
    } satisfies Rate)
    rooms.set(id, entry)
  })
  return [...rooms.values()]
    .map((room) => ({ ...room, rates: room.rates.sort((a, b) => a.pricePerNight - b.pricePerNight) }))
    .sort((a, b) => a.rates[0].pricePerNight - b.rates[0].pricePerNight)
}

/** A hotel the search found no rate for: its first room at the price of the map pin, without a refund. */
function pinRoom(raw: OtaHotel, priceFrom: number): Room {
  const group = raw.static_vm.room_groups[0]
  const name = group?.name_struct.main_name ?? 'Номер'
  return {
    id: 'room-1',
    name,
    area: null,
    beds: group?.name_struct.bedding_type ?? '',
    capacity: 2,
    photos: roomPhotos(name),
    rates: [
      {
        id: 'rate-1',
        meal: 'none',
        cancellation: { kind: 'non-refundable' },
        payment: 'now',
        pricePerNight: priceFrom,
      },
    ],
  }
}

/**
 * The hotel of the search in the destination; `pin` is its map pin, the price of a hotel without rates; `page` the
 * fields of its Ostrovok page. Without the page the description is empty and the times are the generator's, until
 * `npm run db:load:ota-pages` and `npm run db:rebuild:ota`.
 */
export function otaHotel(
  raw: OtaHotel,
  destinationId: string,
  stay: OtaStay,
  pin?: OtaMapHotel,
  page?: OtaPageFields,
): Hotel {
  const vm = raw.static_vm
  const id = otaHotelId(raw.master_id)
  const stayType = STAY_TYPE_OF_KIND[vm.kind] ?? 'hotel'
  const rooms = raw.rates.length ? roomsOf(raw, stay) : null
  const priceFrom = rooms ? rooms[0].rates[0].pricePerNight : pin && roundUp100(pin.price / stay.nights)
  if (!priceFrom) throw new Error(`ota: ${raw.ota_hotel_id} has neither a rate nor a map pin`)
  const rating = vm.rating_total ?? 0

  const summary: HotelSummary = {
    id,
    destinationId,
    name: vm.name,
    stayType,
    stars: Math.min(5, Math.max(0, Math.round((vm.star_rating ?? 0) / 10))) as HotelSummary['stars'],
    rating,
    reviewCount: rating > 0 ? (vm.rating.count ?? 0) : 0,
    priceFrom,
    wifiMbps: null,
    workspace: page?.workspace ?? false,
    isNew: false,
  }
  const subway = vm.nearest_subways.toSorted((a, b) => a.distance - b.distance)[0]
  const hotel = generateHotel(summary, {
    address: vm.address,
    lat: vm.latitude,
    lon: vm.longitude,
    distanceKm: Math.round(vm.search_region_center_distance * 10) / 10,
    metro: subway ? { station: subway.name, meters: Math.round(subway.distance / 10) * 10 } : null,
    amenities: [...new Set(vm.serp_filters.map((f) => AMENITY_OF_FILTER[f]).filter(Boolean))].sort(
      (a, b) => amenityOrder.get(a)! - amenityOrder.get(b)!,
    ),
    // Without images the hotel keeps the generated placeholders.
    ...(vm.images.length > 0 && {
      photos: vm.images.map((image, i) => ({
        id: `photo-${i + 1}`,
        caption: `${vm.name}, фото ${i + 1}`,
        tone: i % PHOTO_TONE_COUNT,
        url: image.tmpl,
      })),
    }),
    rooms: rooms ?? [pinRoom(raw, priceFrom)],
  })
  // Ostrovok's rating and review count are real; the reviews, the scores of the sections and the guests' photos
  // are not in the search, and the generator's would be made up: the page's are the hotel's details.
  return {
    ...hotel,
    description: page?.description ?? '',
    checkInTime: page?.checkIn ?? hotel.checkInTime,
    checkOutTime: page?.checkOut ?? hotel.checkOutTime,
    sectionScores: [],
    reviews: [],
    guestPhotos: [],
  }
}
