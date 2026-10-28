/**
 * The characteristics a hotelier is asked about and answers (hotelier-knowledge): one closed vocabulary for the
 * questions of `ask_hotelier`, the extraction of the answers and the claims they become (`hotelier.<key>` of the
 * store). No `server-only`: the blocks of the browser show the same labels.
 */

export const HOTELIER_CHARACTERISTICS = {
  'room.balcony': 'Балкон в номере',
  'room.window_side': 'Сторона окон',
  'room.view': 'Вид из окон',
  'room.floors': 'Этажи номеров',
  'room.noise': 'Шум в номере',
  'room.location': 'Расположение номера',
  'room.beds': 'Кровати',
  'room.size': 'Площадь номера',
  'room.air_conditioning': 'Кондиционер',
  'hotel.parking': 'Парковка',
  'hotel.pets': 'Питомцы',
  'hotel.breakfast': 'Завтрак',
  'hotel.accessibility': 'Доступность',
  'hotel.check_in': 'Заезд и выезд',
  'hotel.other': 'Другое об отеле',
} as const

export type HotelierKey = keyof typeof HOTELIER_CHARACTERISTICS

export const HOTELIER_KEYS = Object.keys(HOTELIER_CHARACTERISTICS) as [HotelierKey, ...HotelierKey[]]

export const isHotelierKey = (value: string): value is HotelierKey => value in HOTELIER_CHARACTERISTICS

/** The label of a key, the key itself for one off the vocabulary. */
export const characteristicLabel = (key: string) => (isHotelierKey(key) ? HOTELIER_CHARACTERISTICS[key] : key)

/** The claims' property of a characteristic: `hotelier.room.balcony`. */
export const hotelierProperty = (key: HotelierKey) => `hotelier.${key}`

/** The characteristic of a claim's property, `null` for one of another source. */
export function keyOfProperty(property: string): HotelierKey | null {
  const key = property.startsWith('hotelier.') ? property.slice('hotelier.'.length) : ''
  return isHotelierKey(key) ? key : null
}

const WORD = '(?<!\\p{L})'
const TOPICS: [HotelierKey, RegExp][] = [
  ['room.balcony', new RegExp(`${WORD}(?:балкон|террас|лоджи)`, 'iu')],
  [
    'room.window_side',
    new RegExp(`${WORD}(?:окна\\s+(?:на|выход)|сторон[аыу]\\s+окон|на\\s+(?:запад|восток|север|юг))`, 'iu'),
  ],
  ['room.view', new RegExp(`${WORD}(?:вид(?:а|ом)?\\s+(?:на|из)|видно|панорам)`, 'iu')],
  ['room.floors', new RegExp(`${WORD}(?:этаж)`, 'iu')],
  ['room.noise', new RegExp(`${WORD}(?:шум|тих|тиш|звукоизол)`, 'iu')],
  ['room.beds', new RegExp(`${WORD}(?:кроват|двуспал)`, 'iu')],
  ['room.air_conditioning', new RegExp(`${WORD}(?:кондиц)`, 'iu')],
  ['hotel.parking', new RegExp(`${WORD}(?:парковк|паркинг|машин)`, 'iu')],
  ['hotel.pets', new RegExp(`${WORD}(?:питом|собак|кошк|животн)`, 'iu')],
  ['hotel.breakfast', new RegExp(`${WORD}(?:завтрак)`, 'iu')],
  ['hotel.accessibility', new RegExp(`${WORD}(?:лифт|коляск|пандус|доступн)`, 'iu')],
  ['hotel.check_in', new RegExp(`${WORD}(?:ранн\\S*\\s+заезд|поздн\\S*\\s+выезд|заезд|выезд)`, 'iu')],
]

/** The characteristics a question is about, by its words; none when no topic of the vocabulary is named. */
export const questionKeys = (text: string): HotelierKey[] =>
  TOPICS.filter(([, words]) => words.test(text)).map(([key]) => key)

/**
 * What only the hotel can confirm: free rooms, prices and discounts, a guaranteed view or room, the individual terms
 * of a stay. The assistant never confirms them itself; it asks the hotelier.
 */
const CONFIRM_ONLY = new RegExp(
  `${WORD}(?:свободн\\S*\\s+номер|наличи\\S*\\s+(?:мест|номер)|есть\\s+ли\\s+места|цен[аыу]|стоимост|скидк|сколько\\s+стоит|гарантир|точно\\s+будет|индивидуальн|предоплат|бесплатн\\S*\\s+отмен)`,
  'iu',
)

export const needsHotelier = (text: string) => CONFIRM_ONLY.test(text)

/** The traveller asks to ask the hotel itself: «спросите у отеля», «уточните у отельера». */
const ASK_HOTEL = new RegExp(
  `${WORD}(?:спрос|уточн|узна|передай|напиш)\\S*\\s+(?:у\\s+)?(?:отел|отельер|администрац|владел)`,
  'iu',
)

export const asksHotelier = (text: string) => ASK_HOTEL.test(text)
