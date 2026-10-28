import { scenarios, type Destination } from '../../data/destinations'
import { AMENITIES, STAY_TYPES, hasStars, isRated, isSyntheticHotel, type Hotel } from '../catalog'
import { featureLines, type HotelFeatures } from '../features'
import { distanceLabel, type HotelDetails } from '../hotelDetails'
import { kmFromCentre } from '../format'
import { VIBE_AXES, type VibeScale } from '../vibe'

/**
 * The texts the semantic search embeds and reranks: what a traveller would ask about, in Russian. Pure, so
 * `npm run db:embed` builds them in Node; a change here changes `content_hash` and re-embeds the objects.
 */

/** A hotel leans to a side of a vibe axis when its fit is at least this far from the middle. */
const LEAN = 0.34
const REVIEWS = 3
const REVIEW_LENGTH = 240
/** The nearest places of a real hotel's page the text names. */
const PLACES = 8

const sentence = (text: string) => text.trim().replace(/[.!?…]?$/, (end) => end || '.')

/** The sides of the vibe axes the hotel leans to: «Уютный вечер, Море, …». */
export const vibePoles = (hotel: Hotel, scale: VibeScale): string[] =>
  VIBE_AXES.flatMap((axis) => {
    const fit = axis.fit(hotel, scale)
    return fit <= -LEAN ? [axis.left] : fit >= LEAN ? [axis.right] : []
  })

/** The parts of a real hotel's Ostrovok page the text takes: its places nearby and its amenities by group. */
export type DocumentDetails = Pick<HotelDetails, 'nearby' | 'amenityGroups'>

/**
 * The hotel's text; `features` are its building, noise and room views (`hotel_features`), when it has them;
 * `details` the places and the amenities of a real hotel's Ostrovok page.
 */
export function hotelDocument(
  hotel: Hotel,
  destination: Destination,
  scale: VibeScale,
  features?: HotelFeatures,
  details?: DocumentDetails | null,
): string {
  const kind = STAY_TYPES[hotel.stayType]
  const stars = hasStars(hotel) ? `, ${hotel.stars}★` : ''
  const themes = scenarios.filter((s) => destination.scenarios.includes(s.id)).map((s) => s.title)
  const work = hotel.workspace ? ', есть рабочая зона' : ''
  // A real hotel's Wi‑Fi speed is unknown: only its workspace.
  const wifi = hotel.wifiMbps !== null ? `Wi‑Fi ${hotel.wifiMbps} Мбит/с${work}. ` : work ? 'Есть рабочая зона. ' : ''
  const places = (details?.nearby ?? [])
    .slice(0, PLACES)
    .map((place) => `${place.name} (${place.kind.toLocaleLowerCase('ru')}, ${distanceLabel(place.distanceM)})`)
  const groups = (details?.amenityGroups ?? []).map((group) => `${group.name}: ${group.amenities.join(', ')}`)
  const lines = [
    `${kind} «${hotel.name}»${stars} — ${destination.name}, ${destination.country}.`,
    themes.length ? `Город: ${themes.join(', ')}.` : '',
    `${isRated(hotel) ? `Рейтинг гостей ${hotel.rating.toFixed(1)} из 10, ${hotel.reviewCount} отзывов.` : 'Оценок гостей пока нет.'} Цена от ${hotel.priceFrom} ₽ за ночь.`,
    `${wifi}${kmFromCentre(hotel.distanceKm)}.`,
    ...featureLines(features),
    sentence(hotel.description),
    groups.length
      ? `Удобства: ${groups.join('; ')}.`
      : `Удобства: ${hotel.amenities.map((a) => AMENITIES[a].label).join(', ')}.`,
    places.length ? `Рядом: ${places.join(', ')}.` : '',
    `Настроение: ${vibePoles(hotel, scale).join(', ') || 'всего понемногу'}.`,
    // A real hotel shows only Ostrovok's data: any review in its row would be a made-up one.
    ...(isSyntheticHotel(hotel) ? hotel.reviews : [])
      .slice(0, REVIEWS)
      .map(
        (r) =>
          `Отзыв: ${sentence((r.pros ?? '').slice(0, REVIEW_LENGTH))}${r.cons ? ` Минус: ${sentence(r.cons)}` : ''}`,
      ),
  ]
  return lines.filter(Boolean).join('\n')
}
