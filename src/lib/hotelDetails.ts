import type { Review, SectionScore } from './catalog'
import { countRu, formatDecimal } from './format'

/**
 * What the Ostrovok page of a real hotel adds to its catalogue row (`ota_hotel_pages`, `ota_hotel_places`, read by
 * src/lib/ota/page.ts): the description by its parts, the amenities by Ostrovok's groups, the paid services and the
 * fees, the facts, the guests' scores and reviews by their source, the places nearby and the guests' words about the
 * view. Only what the page has: a missing part is empty, never generated. Plain JSON: the API hands it to the dialog.
 */

/** Where a review or a score comes from. */
export type ReviewSource = 'ostrovok' | 'tripadvisor'

export const REVIEW_SOURCE_LABEL: Record<ReviewSource, string> = {
  ostrovok: 'Островок',
  tripadvisor: 'TripAdvisor',
}

/**
 * The sources of Ostrovok's review codes (`reviews.list[].reviewType`, `featuredReviews[].source`): the one place to
 * change them. `ESR` is labelled Островок by decision: Ostrovok counts these reviews in its own `reviewsCountWithEsr`,
 * though what the code stands for is not known. A review of a code not here is not shown.
 */
export const REVIEW_SOURCE_OF_CODE: Readonly<Record<string, ReviewSource>> = {
  OST: 'ostrovok',
  ESR: 'ostrovok',
  TRP: 'tripadvisor',
  TA: 'tripadvisor',
}

/**
 * The guests' part of the hotel page: a rating, or the page's reviews or scores — a real hotel without Ostrovok's
 * total still shows its reviews.
 */
export const hasGuestReviews = (hotel: { rating: number }, details: HotelDetails | null | undefined) =>
  hotel.rating > 0 || Boolean(details && (details.reviews.length > 0 || details.scores.length > 0))

export interface DescriptionPart {
  /** «Расположение», «В отеле», …; may be empty. */
  title: string
  paragraphs: string[]
}

export interface AmenityGroup {
  /** Ostrovok's name of the group: «Общее», «Интернет», … */
  name: string
  /** Ostrovok's slug of the group: `has_internet`, …; picks the icon. */
  slug: string
  amenities: string[]
}

/** A paid service or a fee of the hotel's policies: «Парковка рядом с отелем» — «22 € за машину в сутки». */
export interface PolicyLine {
  label: string
  value: string
}

export interface HotelFacts {
  /** Rooms of the hotel, as the hotel says. */
  rooms: number | null
  /**
   * The floors the hotel's rooms take, as the hotel says (Ostrovok's `floorsNumber`): not the floors of the building,
   * which come from EUBUCCO only (`building`).
   */
  roomFloors: number | null
  yearBuilt: number | null
  yearRenovated: number | null
  /** «Розетки C, F · 230 В · 50 Гц». */
  electricity: string | null
}

/** The building at the hotel's point, from EUBUCCO (`hotel_features`). */
export interface HotelBuilding {
  floors: number | null
  heightM: number | null
  /** EUBUCCO's source of the floors or of the height: `estimated` when a model estimated them. */
  estimated: boolean
  /** EUBUCCO's model estimated the height (`height_source` `estimated`), whatever the floors' source. */
  heightEstimated?: boolean
}

/** The guests' scores of one source. */
export interface SourceScores {
  source: ReviewSource
  /** The source's own scale: Островок out of 10, TripAdvisor out of 5. */
  rating: number | null
  scale: 5 | 10
  reviewCount: number
  /** In the order of `SCORE_SECTIONS`, the ones the source has. */
  sections: SectionScore[]
}

/** A place of Ostrovok near the hotel. */
export interface NearbyPlace {
  /** Ostrovok's region id of the place. */
  id: number
  name: string
  /** Ostrovok's English name, when it is another: it shares words with the names of OpenStreetMap. */
  nameEn?: string
  /** The names of the same place Ostrovok lists again (src/lib/geo/samePlace.ts `mergeOstrovok`); not shown. */
  aliases?: string[]
  /** «Музей», «Метро», «Аэропорт», … */
  kind: string
  /** Ostrovok's distance from the hotel, m. */
  distanceM: number
  /** Degrees from north, clockwise, from the hotel to the place; `null` without the hotel's point. */
  bearingDeg: number | null
  lat: number
  lon: number
  transport: boolean
}

/** A sentence of a review about the view, as the guest wrote it. */
export interface ViewQuote {
  reviewId: string
  source: ReviewSource
  author: string
  text: string
}

export interface HotelDetails {
  description: DescriptionPart[]
  amenityGroups: AmenityGroup[]
  /** The paid services and the fees; the check-in and check-out times are the hotel's own. */
  policies: PolicyLine[]
  /** The hotel's notes for the guests, as they are. */
  notes: string | null
  facts: HotelFacts
  building: HotelBuilding | null
  scores: SourceScores[]
  /** Every review of the page, newest first, the undated after them. */
  reviews: Review[]
  /** Nearest first. */
  nearby: NearbyPlace[]
  viewQuotes: ViewQuote[]
}

/** «135 м», «1,2 км». */
export const distanceLabel = (meters: number) =>
  meters < 1000 ? `${Math.round(meters / 10) * 10} м` : `${formatDecimal(meters / 1000)} км`

/** The lines of the facts: the rooms, the floors they take, the building's floors, the years and the sockets. */
export function factLines(facts: HotelFacts, building: HotelBuilding | null): string[] {
  return [
    facts.rooms && countRu(facts.rooms, ['номер', 'номера', 'номеров']),
    facts.roomFloors && `Номера занимают ${countRu(facts.roomFloors, ['этаж', 'этажа', 'этажей'])} (по данным отеля)`,
    building?.floors &&
      `В здании ${building.estimated ? '≈' : ''}${countRu(building.floors, ['этаж', 'этажа', 'этажей'])}`,
    facts.yearBuilt && `Год постройки: ${facts.yearBuilt}`,
    facts.yearRenovated && `Год реновации: ${facts.yearRenovated}`,
    facts.electricity,
  ].filter((line): line is string => Boolean(line))
}

/** The places the page and Эвал name first: the nearest, the stations among them. */
export const NEARBY_SHOWN = 8
