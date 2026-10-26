import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { HOTEL_UNAVAILABLE, MAX_MESSAGE_LENGTH, type AssistantRequest, type StayDates } from '../assistant'
import { AMENITIES, MEAL_LABEL, STAY_TYPES, roomFacts, travelDistances, type Hotel, type Room } from '../catalog'
import { nightsBetween } from '../dates'
import type { HotelFeatures } from '../features'
import { formatDecimal, formatPrice } from '../format'
import { distanceLabel, factLines, NEARBY_SHOWN, REVIEW_SOURCE_LABEL, type HotelDetails } from '../hotelDetails'
import { averageNight, stayTotal } from '../offer'
import { MODEL_TIMEOUT_MS } from './understand'

/**
 * Эвал's answer to a question about one hotel (`brief.hotelId`): from the hotel's data — the description, the
 * amenities, the distances, the rooms with prices on the chat's dates and, for a real hotel, its Ostrovok page
 * (`HotelDetails`: the places nearby, the paid services, the facts, the scores, the reviews and the guests' words about
 * the view) — and, apart, from the model's general knowledge, which the feed marks «Не проверено». Without the model
 * the ready-made questions about the rooms, the parking, the pets and the places nearby are answered by rules from
 * the data; anything else is an honest «не могу ответить».
 */

export interface HotelAnswer {
  answer: string
  /** The model's part from general knowledge; rules never give one. */
  unverified?: string
}

const MAX_ANSWER_LENGTH = 900
/** The rooms the rules list and the facts hand to the model. */
const MAX_ROOMS = 8
/** The places, the reviews and the view quotes the facts hand to the model. */
const MAX_PLACES = 20
const MAX_REVIEWS = 6
const MAX_REVIEW_LENGTH = 300
const MAX_QUOTES = 6

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

/** «Парковка рядом с отелем: 22 € за машину в сутки.» of the page's paid services whose label starts so. */
const policyLines = (details: HotelDetails | null | undefined, label: RegExp) =>
  (details?.policies ?? []).filter((line) => label.test(line.label)).map((line) => ` ${line.label}: ${line.value}.`)

/** «Фира Валенсия (станция) — 140 м». */
const placeLine = (place: HotelDetails['nearby'][number]) =>
  `${place.name} (${place.kind.toLocaleLowerCase('ru')}) — ${distanceLabel(place.distanceM)}`

/** The ready-made questions by rules from the hotel's data; none of the model's general knowledge. */
export function ruleAnswer(text: string, hotel: Hotel, dates?: StayDates, details?: HotelDetails | null): HotelAnswer {
  const has = (...keys: (keyof typeof AMENITIES)[]) => keys.find((key) => hotel.amenities.includes(key))
  if (PETS.test(text)) {
    const pets = has('pets')
    const fees = policyLines(details, /питомц/i).join('')
    return {
      answer: pets
        ? `Да, ${amenityLabel(pets).toLocaleLowerCase('ru')}${paid(pets)}.${fees}`
        : 'В данных отеля о размещении с питомцами ничего не сказано. Уточните это у отеля до бронирования.',
    }
  }
  if (PARKING.test(text)) {
    const parking = has('parking', 'parking-nearby')
    const fees = policyLines(details, /^Парковка/).join('')
    return {
      answer: parking
        ? `Да: ${amenityLabel(parking).toLocaleLowerCase('ru')}${paid(parking)}.${fees}`
        : fees
          ? `По данным отеля:${fees}`
          : 'В данных отеля парковка не указана. Уточните это у отеля до бронирования.',
    }
  }
  if (NEARBY.test(text)) {
    const places = details?.nearby.slice(0, NEARBY_SHOWN) ?? []
    if (places.length === 0) return { answer: `${NO_NEARBY_DATA} Расстояния: ${distanceLine(hotel)}.` }
    return {
      answer: `Рядом с отелем, по данным Островка:\n${places.map((place) => `• ${placeLine(place)}`).join('\n')}`,
    }
  }
  if (ROOMS.test(text)) {
    const lines = roomLines(hotel, dates)
    if (lines.length === 0) return { answer: 'В данных отеля номеров нет.' }
    const hint = dates ? '' : '\nВыберите даты — покажу цены.'
    return { answer: `Номера отеля:\n${lines.map((line) => `• ${line}`).join('\n')}${hint}` }
  }
  return { answer: HOTEL_UNAVAILABLE }
}

/** The lines of the hotel's Ostrovok page for the model: each part the page has, under its own heading. */
function detailLines(details: HotelDetails): string[] {
  const scores = details.scores.map((s) =>
    [
      `${REVIEW_SOURCE_LABEL[s.source]}:`,
      s.rating !== null && ` ${formatDecimal(s.rating)} из ${s.scale}`,
      s.reviewCount > 0 && `, отзывов: ${s.reviewCount}`,
      s.sections.length > 0 && `; ${s.sections.map((x) => `${x.label} ${formatDecimal(x.score)}`).join(', ')}`,
    ]
      .filter(Boolean)
      .join(''),
  )
  // The building's floors are the features' (EUBUCCO) line; the facts give the floors the rooms take.
  const facts = factLines(details.facts, null)
  return [
    details.amenityGroups.length > 0 &&
      `Удобства по данным Островка:\n${details.amenityGroups.map((g) => `- ${g.name}: ${g.amenities.join(', ')}`).join('\n')}`,
    details.policies.length > 0 &&
      `Дополнительные услуги и сборы:\n${details.policies.map((p) => `- ${p.label}: ${p.value}`).join('\n')}`,
    details.notes && `Примечания отеля: ${details.notes.replace(/\s+/g, ' ')}`,
    facts.length > 0 && `Факты: ${facts.join('; ')}`,
    scores.length > 0 && `Оценки гостей по источникам: ${scores.join(' | ')}`,
    details.nearby.length > 0 &&
      `Места рядом (по данным Островка, расстояние от отеля):\n${details.nearby
        .slice(0, MAX_PLACES)
        .map((place) => `- ${placeLine(place)}`)
        .join('\n')}`,
    details.viewQuotes.length > 0 &&
      `Что гости пишут о виде (цитаты из отзывов):\n${details.viewQuotes
        .slice(0, MAX_QUOTES)
        .map((q) => `- «${q.text}» (${REVIEW_SOURCE_LABEL[q.source]})`)
        .join('\n')}`,
    details.reviews.length > 0 &&
      `Отзывы гостей (новые первыми):\n${details.reviews
        .slice(0, MAX_REVIEWS)
        .map((r) => {
          const body = [r.title, r.text, r.pros && `Плюсы: ${r.pros}`, r.cons && `Минусы: ${r.cons}`]
            .filter(Boolean)
            .join(' ')
          return `- ${r.score}/10, ${r.source ? REVIEW_SOURCE_LABEL[r.source] : 'гость'}: ${body.slice(0, MAX_REVIEW_LENGTH)}`
        })
        .join('\n')}`,
  ].filter((line): line is string => Boolean(line))
}

/** Everything the model may state as a fact about the hotel; `details` are its Ostrovok page's. */
export function hotelFacts(
  hotel: Hotel,
  dates?: StayDates,
  features?: HotelFeatures,
  details?: HotelDetails | null,
): string {
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
    hotel.wifiMbps !== null
      ? `Wi‑Fi ${hotel.wifiMbps} Мбит/с${hotel.workspace ? ', есть рабочая зона' : ''}`
      : `Скорость Wi‑Fi неизвестна${hotel.workspace ? '; есть рабочая зона' : ''}`,
    features?.floors && `Этажей в здании (EUBUCCO): ${features.floors}`,
    features?.buildingDoubtful &&
      'Этажность и высота здания: надёжных данных по зданию нет (здание в EUBUCCO у точки отеля ниже, чем этажи номеров по данным отеля).',
    ...(details ? detailLines(details) : []),
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
    !details?.nearby.length && 'Данных о местах рядом (кафе, достопримечательности, пляж) в базе нет.',
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

function instructions(hotel: Hotel, dates?: StayDates, features?: HotelFeatures, details?: HotelDetails | null) {
  return [
    `Ты Эвал, помощник сервиса «О!бъективно» на странице отеля «${hotel.name}». Отвечай по-русски, дружелюбно и коротко.`,
    'Поле answer — ТОЛЬКО то, что есть в данных отеля ниже. Ничего не выдумывай: если в данных ответа нет, так и скажи.',
    'Поле unverified — то, чего в данных нет, но ты знаешь из общих знаний (например, что обычно есть рядом с этим районом); это не проверено. Если нечего добавить — null.',
    'Названия мест рядом, расстояния и время пешком, которых нет в данных, можно писать только в unverified.',
    'Этажность здания — только строка «Этажей в здании (EUBUCCO)»; «номера занимают N этажей» — это не этажность здания.',
    'Цены называй только из данных. Отвечай только JSON по схеме: ' + JSON.stringify(z.toJSONSchema(answerSchema)),
    '',
    'Данные отеля:',
    hotelFacts(hotel, dates, features, details),
  ].join('\n')
}

/** A letter that is neither Cyrillic nor Latin: the model slipped into Chinese or Korean. */
const FOREIGN_SCRIPT = /(?![\p{Script=Cyrillic}\p{Script=Latin}])\p{L}/u
/** At least this share of the letters is Cyrillic: names, «Wi‑Fi» and streets of a hotel are Latin. */
const MIN_CYRILLIC_SHARE = 0.5

/** Mainly Russian: the hotel's Latin names and terms are fine, an answer in English or in another script is not. */
export function isRussian(text: string): boolean {
  if (FOREIGN_SCRIPT.test(text)) return false
  const letters = text.match(/\p{L}/gu) ?? []
  const cyrillic = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter))
  return letters.length > 0 && cyrillic.length / letters.length >= MIN_CYRILLIC_SHARE
}

const clean = (value: string | null | undefined, max: number): string | undefined => {
  const text = value?.trim().slice(0, max)
  return text && isRussian(text) ? text : undefined
}

/**
 * The model's answer about the hotel. Throws on a model error, a timeout, an abort or an answer with no usable
 * part: the route then answers by rules.
 */
export async function answerWithModel(
  model: LanguageModel,
  { messages }: Pick<AssistantRequest, 'messages'>,
  hotel: Hotel,
  options: {
    dates?: StayDates
    features?: HotelFeatures
    details?: HotelDetails | null
    signal?: AbortSignal
    timeoutMs?: number
  } = {},
): Promise<HotelAnswer> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? MODEL_TIMEOUT_MS)
  const { output } = await generateText({
    model,
    instructions: instructions(hotel, options.dates, options.features, options.details),
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
