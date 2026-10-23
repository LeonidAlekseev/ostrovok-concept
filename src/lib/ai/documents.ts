import { scenarios, type Destination } from '../../data/destinations'
import { AMENITIES, STAY_TYPES, hasStars, type Hotel } from '../catalog'
import { VIBE_AXES, type VibeScale } from '../vibe'

/**
 * The texts the semantic search embeds and reranks: what a traveller would ask about, in Russian. Pure, so
 * `npm run db:embed` builds them in Node; a change here changes `content_hash` and re-embeds the objects.
 */

/** A hotel leans to a side of a vibe axis when its fit is at least this far from the middle. */
const LEAN = 0.34
const REVIEWS = 3
const REVIEW_LENGTH = 240

const sentence = (text: string) => text.trim().replace(/[.!?…]?$/, (end) => end || '.')

/** The sides of the vibe axes the hotel leans to: «Тихий вечер, Море, …». */
export const vibePoles = (hotel: Hotel, scale: VibeScale): string[] =>
  VIBE_AXES.flatMap((axis) => {
    const fit = axis.fit(hotel, scale)
    return fit <= -LEAN ? [axis.left] : fit >= LEAN ? [axis.right] : []
  })

export function hotelDocument(hotel: Hotel, destination: Destination, scale: VibeScale): string {
  const kind = STAY_TYPES[hotel.stayType]
  const stars = hasStars(hotel.stayType) ? `, ${hotel.stars}★` : ''
  const themes = scenarios.filter((s) => destination.scenarios.includes(s.id)).map((s) => s.title)
  const work = hotel.workspace ? ', есть рабочая зона' : ''
  const lines = [
    `${kind} «${hotel.name}»${stars} — ${destination.name}, ${destination.country}.`,
    themes.length ? `Город: ${themes.join(', ')}.` : '',
    `Рейтинг гостей ${hotel.rating.toFixed(1)} из 10, ${hotel.reviewCount} отзывов. Цена от ${hotel.priceFrom} ₽ за ночь.`,
    `Wi‑Fi ${hotel.wifiMbps} Мбит/с${work}. ${hotel.distanceKm.toFixed(1)} км от центра.`,
    sentence(hotel.description),
    `Удобства: ${hotel.amenities.map((a) => AMENITIES[a].label).join(', ')}.`,
    `Настроение: ${vibePoles(hotel, scale).join(', ') || 'всего понемногу'}.`,
    ...hotel.reviews
      .slice(0, REVIEWS)
      .map((r) => `Отзыв: ${sentence(r.pros.slice(0, REVIEW_LENGTH))}${r.cons ? ` Минус: ${sentence(r.cons)}` : ''}`),
  ]
  return lines.filter(Boolean).join('\n')
}
