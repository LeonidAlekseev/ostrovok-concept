import type { Destination, ScenarioId } from '../data/destinations'
import type { Hotel } from './catalog'

/**
 * The vibe search: seven pairs of opposites, each a way to read the catalogue. An answer is −1 (the left
 * option), +1 (the right one) or 0 («Не могу выбрать»). A hotel's fit on an axis is a number in [−1, 1]
 * with the same sign convention, so a matching answer adds to its score and an opposite one takes away.
 */

export type Answer = -1 | 0 | 1

export interface VibeAxis {
  id: string
  left: string
  right: string
  /** Fit of the hotel against the catalogue's scale: −1 is all left, +1 all right. */
  fit: (hotel: Hotel, scale: VibeScale) => number
}

/** What the fits measure a hotel against: the catalogue it is picked from. */
export interface VibeScale {
  /** The nearest and the farthest distance to the centre, km. */
  minKm: number
  maxKm: number
  /** Median `priceFrom` of every city: a hotel is cheap or dear against its own city. */
  medianPrice: ReadonlyMap<string, number>
  scenarios: ReadonlyMap<string, readonly ScenarioId[]>
}

/** The scale of the catalogue's `hotels` in their `destinations`. */
export function vibeScale(hotels: readonly Hotel[], destinations: readonly Destination[]): VibeScale {
  const distances = hotels.map((h) => h.distanceKm)
  return {
    minKm: Math.min(...distances),
    maxKm: Math.max(...distances),
    medianPrice: new Map(
      destinations.map((city) => {
        const prices = hotels
          .filter((h) => h.destinationId === city.id)
          .map((h) => h.priceFrom)
          .sort((a, b) => a - b)
        const mid = prices.length >> 1
        return [city.id, prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2]
      }),
    ),
    scenarios: new Map(destinations.map((city) => [city.id, city.scenarios])),
  }
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

/** The catalogue's nearest hotel is +1, the farthest −1. */
const centrality = (hotel: Hotel, { minKm, maxKm }: VibeScale) =>
  clamp(1 - (2 * (hotel.distanceKm - minKm)) / (maxKm - minKm))
const has = (hotel: Hotel, amenity: Hotel['amenities'][number]) => hotel.amenities.includes(amenity)

export const VIBE_AXES: readonly VibeAxis[] = [
  {
    id: 'evening',
    left: 'Уютный вечер',
    right: 'Шумная вечеринка',
    fit: (h, scale) => (has(h, 'bar') ? 0.5 : -0.5) + (has(h, 'restaurant') ? 0.25 : -0.25) + centrality(h, scale) / 4,
  },
  {
    id: 'place',
    left: 'Море',
    right: 'Город',
    fit: (h, scale) => {
      const scenarios = scale.scenarios.get(h.destinationId)!
      const sea = scenarios.includes('sea')
      const city = scenarios.includes('europe') || scenarios.includes('weekend')
      return sea === city ? 0 : sea ? -1 : 1
    },
  },
  {
    id: 'size',
    left: 'Уютный бутик',
    right: 'Большой отель',
    fit: (h) => (h.stars <= 3 ? -1 : h.stars === 5 ? 1 : 0),
  },
  {
    id: 'leisure',
    left: 'Спа и бассейн',
    right: 'Гулять до ночи',
    fit: (h, scale) => (centrality(h, scale) - ((has(h, 'spa') ? 1 : 0) + (has(h, 'pool') ? 1 : 0) - 1)) / 2,
  },
  {
    id: 'food',
    left: 'Завтрак в номер',
    right: 'Ужин в новом месте',
    // Every meal but `none` includes breakfast: the share of rates with it against the share without.
    fit: (h) => {
      const rates = h.rooms.flatMap((room) => room.rates)
      if (rates.length === 0) return 0
      return (2 * rates.filter((rate) => rate.meal === 'none').length) / rates.length - 1
    },
  },
  {
    id: 'budget',
    left: 'Без лишних трат',
    right: 'Всё самое лучшее',
    // Twice the city median is +1, half of it −1.
    fit: (h, scale) => clamp(Math.log2(h.priceFrom / scale.medianPrice.get(h.destinationId)!)),
  },
  {
    id: 'location',
    left: 'Подальше от суеты',
    right: 'В центре событий',
    fit: centrality,
  },
]

export const VIBE_STEPS = VIBE_AXES.length

/** The photo of a side of an axis: `public/images/vibe/evening-left.webp` is «Уютный вечер». */
export const poleImage = (axisId: string, side: -1 | 1) => `/images/vibe/${axisId}-${side < 0 ? 'left' : 'right'}.webp`

export interface Archetype {
  /** The archetype in an address: `pick` of the selection on /search. */
  id: string
  name: string
  description: string
  /** The photo of the main pole; «Баланс во всём» has its own. */
  image: string
}

/** A side of an axis: `evening:-1` is «Уютный вечер». */
type Pole = `${string}:${-1 | 1}`

/** The sides the answers chose; «Не могу выбрать» chooses none. */
const chosenPoles = (answers: readonly Answer[]) =>
  new Set(VIBE_AXES.flatMap((axis, i) => (answers[i] ? [`${axis.id}:${answers[i]}`] : [])))

/** The first pole of an archetype is its main axis. Every pole is in some archetype, so any answer but «Не могу выбрать» everywhere has a match. */
const ARCHETYPES: readonly (Omit<Archetype, 'image'> & { poles: readonly [Pole, Pole] })[] = [
  {
    id: 'quiet-harbour',
    name: 'Тихая гавань',
    description: 'Тишина, простор и вечер без спешки',
    poles: ['evening:-1', 'location:-1'],
  },
  {
    id: 'party-soul',
    name: 'Душа вечеринки',
    description: 'Музыка, бары и прогулки до рассвета',
    poles: ['evening:1', 'leisure:1'],
  },
  {
    id: 'city-explorer',
    name: 'Городской исследователь',
    description: 'Новые улицы и новые места каждый вечер',
    poles: ['place:1', 'food:1'],
  },
  {
    id: 'sea-hedonist',
    name: 'Морской гедонист',
    description: 'Море, спа и бассейн — отдых без будильника',
    poles: ['place:-1', 'leisure:-1'],
  },
  {
    id: 'minimalist',
    name: 'Эстет-минималист',
    description: 'Маленький отель с характером и ничего лишнего',
    poles: ['size:-1', 'budget:-1'],
  },
  {
    id: 'luxury',
    name: 'Ценитель роскоши',
    description: 'Большой отель и всё самое лучшее',
    poles: ['size:1', 'budget:1'],
  },
  {
    id: 'city-heart',
    name: 'Сердце города',
    description: 'Жить в центре и быть в гуще событий',
    poles: ['location:1', 'place:1'],
  },
  {
    id: 'cozy-sybarite',
    name: 'Уютный сибарит',
    description: 'Завтрак в постель и долгий день в спа',
    poles: ['food:-1', 'leisure:-1'],
  },
]

export const BALANCE: Archetype = {
  id: 'balance',
  name: 'Баланс во всём',
  description: 'Всего понемногу — и всё по настроению',
  image: '/images/vibe/balance.webp',
}

/** The name of the archetype `id`, or `undefined` for an unknown one. */
export const archetypeName = (id: string): string | undefined =>
  (id === BALANCE.id ? BALANCE : ARCHETYPES.find((a) => a.id === id))?.name

/**
 * The archetype of the answers: the one whose two poles match most of them; on a tie the one whose main
 * axis is answered, then the table order; «Баланс во всём» when none matches.
 */
export function vibeArchetype(answers: readonly Answer[]): Archetype {
  const chosen = chosenPoles(answers)
  let best: Archetype = BALANCE
  let bestScore = 0
  for (const { poles, ...archetype } of ARCHETYPES) {
    // A match is worth two, the main axis one more: the main axis only breaks a tie of matches.
    const score = 2 * poles.filter((pole) => chosen.has(pole)).length + (chosen.has(poles[0]) ? 1 : 0)
    if (score > bestScore) {
      const [axisId, side] = poles[0].split(':')
      best = { ...archetype, image: poleImage(axisId, Number(side) < 0 ? -1 : 1) }
      bestScore = score
    }
  }
  return best
}

export interface AxisShare {
  axis: VibeAxis
  /** Percent of the left option; the right one is the rest. */
  left: number
  right: number
}

/** The left option is 100/0, the right one 0/100, «Не могу выбрать» 50/50. */
export const axisShares = (answers: readonly Answer[]): AxisShare[] =>
  VIBE_AXES.map((axis, i) => {
    const left = 50 - 50 * (answers[i] ?? 0)
    return { axis, left, right: 100 - left }
  })

/** Hotels in a vibe result: one per city, then more from the same cities. */
export const VIBE_HOTELS = 6

/**
 * The `hotels` that fit the answers best, one per city first: the sum of the answers times the hotel's fits; equal
 * scores go to the better rated, then the cheaper, then by id, so the same answers give the same list.
 */
export function vibeHotels(
  answers: readonly Answer[],
  hotels: readonly Hotel[],
  destinations: readonly Destination[],
): Hotel[] {
  const scale = vibeScale(hotels, destinations)
  const scored = hotels.map((hotel) => ({
    hotel,
    score: VIBE_AXES.reduce((sum, axis, i) => sum + (answers[i] ?? 0) * axis.fit(hotel, scale), 0),
  }))
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.hotel.rating - a.hotel.rating ||
      a.hotel.priceFrom - b.hotel.priceFrom ||
      a.hotel.id.localeCompare(b.hotel.id),
  )
  return fillVibe(scored.map(({ hotel }) => hotel))
}

/**
 * `VIBE_HOTELS` of the ranked `hotels`: the best of each city first, then, while fewer than that, the next ones
 * in order from the cities already taken. Keeps the ranking, so the same input gives the same list.
 */
export function fillVibe(hotels: readonly Hotel[]): Hotel[] {
  const cities = new Set<string>()
  const picked: Hotel[] = []
  const rest: Hotel[] = []
  for (const hotel of hotels) {
    if (cities.has(hotel.destinationId)) rest.push(hotel)
    else {
      cities.add(hotel.destinationId)
      picked.push(hotel)
    }
  }
  return [...picked, ...rest].slice(0, VIBE_HOTELS)
}

/**
 * The answers as words for the semantic search: the archetype and the chosen sides, as the hotels' texts
 * name them («Настроение: Уютный вечер, Море…»). Empty when every answer is «Не могу выбрать».
 */
export function vibeWish(answers: readonly Answer[]): string {
  const sides = VIBE_AXES.flatMap((axis, i) => (answers[i] ? [answers[i] < 0 ? axis.left : axis.right] : []))
  if (sides.length === 0) return ''
  const { name, description } = vibeArchetype(answers)
  return `${name}: ${description.toLocaleLowerCase('ru')}. Настроение: ${sides.join(', ')}.`
}

export interface Vibe {
  archetype: Archetype
  shares: AxisShare[]
  hotels: Hotel[]
}
