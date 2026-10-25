import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { HOTEL_UNAVAILABLE, MAX_MESSAGE_LENGTH, type AssistantRequest, type StayDates } from '../assistant'
import { AMENITIES, MEAL_LABEL, STAY_TYPES, roomFacts, travelDistances, type Hotel, type Room } from '../catalog'
import { nightsBetween } from '../dates'
import type { HotelFeatures } from '../features'
import { formatDecimal, formatPrice } from '../format'
import { averageNight, stayTotal } from '../offer'
import { MODEL_TIMEOUT_MS, OTHER_SCRIPT } from './understand'

/**
 * Эвал's answer to a question about one hotel (`brief.hotelId`): from the hotel's data — the description, the
 * amenities, the distances, the rooms with prices on the chat's dates — and, apart, from the model's general
 * knowledge, which the feed marks «Не проверено». Without the model the ready-made questions about the rooms, the
 * parking and the pets are answered by rules from the data; anything else is an honest «не могу ответить».
 */

export interface HotelAnswer {
  answer: string
  /** The model's part from general knowledge; rules never give one. */
  unverified?: string
}

const MAX_ANSWER_LENGTH = 900
/** The rooms the rules list and the facts hand to the model. */
const MAX_ROOMS = 8

export const NO_NEARBY_DATA = 'Сейчас не могу ответить: данных о местах рядом пока нет.'

const ROOMS = /номер|комнат|апартамент|спальн|кроват|проживани|цен|стоим/i
const PARKING = /парков|машин|автомоб|припарков/i
const PETS = /питомц|собак|кошк|животн|с питом/i
const NEARBY = /рядом|поблизости|недалеко|вокруг|окрестност|достопримечат|что посмотреть|куда сходить/i

/** The price line of a room on the chat's dates, or the cheapest night without them. */
function roomPrice(room: Room, dates?: StayDates): string {
  const rate = room.rates[0]
  if (!rate) return ''
  if (!dates) return ''
  const nights = nightsBetween(dates.checkIn, dates.checkOut)
  const total = stayTotal(rate.pricePerNight, dates.checkIn, dates.checkOut, 1)
  return `${formatPrice(averageNight(total, nights, 1))} за ночь, ${formatPrice(total)} за ${nights} н.`
}

function roomLines(hotel: Hotel, dates?: StayDates): string[] {
  return hotel.rooms.slice(0, MAX_ROOMS).map((room) => {
    const price = roomPrice(room, dates)
    return `${room.name} — ${roomFacts(room)}${price ? `, ${price}` : ''}`
  })
}

const amenityLabel = (key: keyof typeof AMENITIES) => AMENITIES[key].label
const paid = (key: keyof typeof AMENITIES) => ('paid' in AMENITIES[key] ? ' (за отдельную плату)' : '')

function distanceLine(hotel: Hotel): string {
  const { centre, metro, airport } = travelDistances(hotel)
  return [
    `до центра ${formatDecimal(centre)} км`,
    metro !== null && `до метро ${formatDecimal(metro)} км`,
    airport !== null && `до аэропорта ${formatDecimal(airport)} км по прямой`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** The ready-made questions by rules from the hotel's data; none of the model's general knowledge. */
export function ruleAnswer(text: string, hotel: Hotel, dates?: StayDates): HotelAnswer {
  const has = (...keys: (keyof typeof AMENITIES)[]) => keys.find((key) => hotel.amenities.includes(key))
  if (PETS.test(text)) {
    const pets = has('pets')
    return {
      answer: pets
        ? `Да, ${amenityLabel(pets).toLocaleLowerCase('ru')}${paid(pets)}.`
        : 'В данных отеля о размещении с питомцами ничего не сказано. Уточните это у отеля до бронирования.',
    }
  }
  if (PARKING.test(text)) {
    const parking = has('parking', 'parking-nearby')
    return {
      answer: parking
        ? `Да: ${amenityLabel(parking).toLocaleLowerCase('ru')}${paid(parking)}.`
        : 'В данных отеля парковка не указана. Уточните это у отеля до бронирования.',
    }
  }
  if (NEARBY.test(text)) return { answer: `${NO_NEARBY_DATA} Расстояния: ${distanceLine(hotel)}.` }
  if (ROOMS.test(text)) {
    const lines = roomLines(hotel, dates)
    if (lines.length === 0) return { answer: 'В данных отеля номеров нет.' }
    const hint = dates ? '' : '\nВыберите даты — покажу цены.'
    return { answer: `Номера отеля:\n${lines.map((line) => `• ${line}`).join('\n')}${hint}` }
  }
  return { answer: HOTEL_UNAVAILABLE }
}

/** Everything the model may state as a fact about the hotel. */
export function hotelFacts(hotel: Hotel, dates?: StayDates, features?: HotelFeatures): string {
  const nights = dates ? nightsBetween(dates.checkIn, dates.checkOut) : 0
  const amenities = hotel.amenities.map((key) => `${amenityLabel(key)}${paid(key)}`)
  return [
    `Название: ${hotel.name}`,
    `Тип: ${STAY_TYPES[hotel.stayType]}${hotel.stars ? `, ${hotel.stars} звёзд` : ''}`,
    `Адрес: ${hotel.address}`,
    hotel.rating > 0 && `Оценка гостей: ${formatDecimal(hotel.rating)} из 10, отзывов: ${hotel.reviewCount}`,
    `Заезд с ${hotel.checkInTime}, выезд до ${hotel.checkOutTime}`,
    `Расстояния: ${distanceLine(hotel)}`,
    hotel.description && `Описание: ${hotel.description}`,
    `Удобства: ${amenities.join('; ') || 'не указаны'}`,
    `Wi‑Fi ${hotel.wifiMbps} Мбит/с${hotel.workspace ? ', есть рабочая зона' : ''}`,
    features?.floors && `Этажей в здании: ${features.floors}`,
    dates
      ? `Даты: ${dates.checkIn} — ${dates.checkOut} (${nights} н.)`
      : 'Даты не выбраны: цен на даты нет, можно назвать только «от» за ночь.',
    `Номера:\n${hotel.rooms
      .slice(0, MAX_ROOMS)
      .map((room) => {
        const rate = room.rates[0]
        const price = dates ? roomPrice(room, dates) : rate ? `от ${formatPrice(rate.pricePerNight)} за ночь` : ''
        const meal = rate && rate.meal !== 'none' ? `, ${MEAL_LABEL[rate.meal].toLocaleLowerCase('ru')}` : ''
        return `- ${room.name}: ${roomFacts(room)}${meal}${price ? `; ${price}` : ''}`
      })
      .join('\n')}`,
    'Данных о местах рядом (кафе, достопримечательности, пляж) в базе нет.',
  ]
    .filter(Boolean)
    .join('\n')
}

const answerSchema = z.object({
  answer: z.string().describe('ответ только из данных отеля; если данных нет — так и скажи; до 600 символов'),
  unverified: z
    .string()
    .nullable()
    .catch(null)
    .describe('то, чего в данных нет, но что ты знаешь сам (общие знания); null, если добавить нечего'),
})

function instructions(hotel: Hotel, dates?: StayDates, features?: HotelFeatures) {
  return [
    `Ты Эвал, помощник сервиса «О!бъективно» на странице отеля «${hotel.name}». Отвечай по-русски, дружелюбно и коротко.`,
    'Поле answer — ТОЛЬКО то, что есть в данных отеля ниже. Ничего не выдумывай: если в данных ответа нет, так и скажи.',
    'Поле unverified — то, чего в данных нет, но ты знаешь из общих знаний (например, что обычно есть рядом с этим районом); это не проверено. Если нечего добавить — null.',
    'Названия мест рядом, расстояния и время пешком, которых нет в данных, можно писать только в unverified.',
    'Цены называй только из данных. Отвечай только JSON по схеме: ' + JSON.stringify(z.toJSONSchema(answerSchema)),
    '',
    'Данные отеля:',
    hotelFacts(hotel, dates, features),
  ].join('\n')
}

const clean = (value: string | null | undefined, max: number): string | undefined => {
  const text = value?.trim().slice(0, max)
  return text && !OTHER_SCRIPT.test(text) ? text : undefined
}

/**
 * The model's answer about the hotel. Throws on a model error, a timeout, an abort or an answer with no usable
 * part: the route then answers by rules.
 */
export async function answerWithModel(
  model: LanguageModel,
  { messages }: Pick<AssistantRequest, 'messages'>,
  hotel: Hotel,
  options: { dates?: StayDates; features?: HotelFeatures; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<HotelAnswer> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? MODEL_TIMEOUT_MS)
  const { output } = await generateText({
    model,
    instructions: instructions(hotel, options.dates, options.features),
    messages: messages.map(({ role, text }) => ({ role, content: text.slice(0, MAX_MESSAGE_LENGTH) })),
    output: Output.object({ schema: answerSchema }),
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  })
  const answer = clean(output.answer, MAX_ANSWER_LENGTH)
  if (!answer) throw new Error('The model gave no answer')
  const unverified = clean(output.unverified, MAX_ANSWER_LENGTH)
  return { answer, ...(unverified && { unverified }) }
}
