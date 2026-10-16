import { destinations, type Destination } from '../data/destinations'
import { newHotels, type NewHotel } from '../data/hotels'

/** "Полный рандом": the stars (that is, Math.random) pick one of the best new hotels. */

export interface ZodiacSign {
  id: string
  name: string
  symbol: string
  /** What the stars say about this sign on the road; `{city}` is replaced with the picked city. */
  prophecy: string
}

export const zodiac: ZodiacSign[] = [
  {
    id: 'aries',
    name: 'Овен',
    symbol: '♈',
    prophecy: 'Овнам противопоказана скука — {city} разгонит кровь и подарит историю для тостов.',
  },
  {
    id: 'taurus',
    name: 'Телец',
    symbol: '♉',
    prophecy: 'Тельцы знают толк в комфорте: {city} встретит мягкой кроватью и лучшим завтраком сезона.',
  },
  {
    id: 'gemini',
    name: 'Близнецы',
    symbol: '♊',
    prophecy: 'Близнецам нужно два впечатления в час — {city} справится с этим без перерыва.',
  },
  {
    id: 'cancer',
    name: 'Рак',
    symbol: '♋',
    prophecy: 'Ракам важно чувствовать себя как дома — {city} станет домом хотя бы на неделю.',
  },
  { id: 'leo', name: 'Лев', symbol: '♌', prophecy: 'Львы рождены для сцены: {city} уже готовит вам красную дорожку.' },
  {
    id: 'virgo',
    name: 'Дева',
    symbol: '♍',
    prophecy: 'Девы любят, когда всё идеально. Звёзды проверили: {city} — без единой ошибки.',
  },
  {
    id: 'libra',
    name: 'Весы',
    symbol: '♎',
    prophecy: 'Весы ищут гармонию — и найдут её в городе {city} где-то между ужином и закатом.',
  },
  {
    id: 'scorpio',
    name: 'Скорпион',
    symbol: '♏',
    prophecy: 'Скорпионам по душе тайны: {city} откроет вам пару своих секретов.',
  },
  {
    id: 'sagittarius',
    name: 'Стрелец',
    symbol: '♐',
    prophecy: 'Стрельцы созданы для дороги: следующая остановка — {city}.',
  },
  { id: 'capricorn', name: 'Козерог', symbol: '♑', prophecy: 'Козероги всегда на вершине — {city} станет следующей.' },
  {
    id: 'aquarius',
    name: 'Водолей',
    symbol: '♒',
    prophecy: 'Водолеи не ходят проторёнными путями — {city} понравится вам именно поэтому.',
  },
  { id: 'pisces', name: 'Рыбы', symbol: '♓', prophecy: 'Рыбы плывут по течению мечты, и течение шепчет: {city}.' },
]

export const tripMoods = [
  '🔥 Авантюра',
  '🌙 Мистика',
  '💘 Роман',
  '🍷 Гедонизм',
  '🧘 Дзен',
  '🎉 Тусовка',
  '📸 Сторис',
  '👑 Роскошь',
]

/** "Best" new hotels: guest rating 9.0 and above. */
const BEST_RATING = 9
export const bestHotels = newHotels.filter((h) => h.rating >= BEST_RATING)

export const cityOf = (hotel: NewHotel): Destination => destinations.find((d) => d.id === hotel.destinationId)!

export interface Fortune {
  hotel: NewHotel
  city: Destination
  mood: string
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

export function drawFortune(previous?: Fortune): Fortune {
  // Never the same hotel twice in a row: a re-spin must feel like a new result.
  const pool = bestHotels.filter((h) => h !== previous?.hotel)
  const hotel = pick(pool)
  return { hotel, city: cityOf(hotel), mood: pick(tripMoods) }
}

/** A reel strip: random filler that ends on the winning symbol. */
export function reelStrip(items: string[], winner: string, length: number): string[] {
  const filler = Array.from({ length: length - 1 }, () => pick(items))
  return [...filler, winner]
}

export const prophecyFor = (sign: ZodiacSign, city: Destination) => sign.prophecy.replace('{city}', city.name)
