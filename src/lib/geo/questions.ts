import type { PlaceCategory } from './categories'

/**
 * The traveller's words about the places near a hotel: whether the question is one for the geo tools, and the
 * categories the rules ask when no model chose the calls. No `server-only`: the chat shows its pending step by them.
 */

/** A word starting with `stem`: «бар» and «бары», not «Барселона». */
const word = (stem: string, endings = '') => new RegExp(`(?<!\\p{L})${stem}(?:${endings})(?!\\p{L})`, 'iu')
const stemOf = (stem: string) => new RegExp(`(?<!\\p{L})${stem}`, 'iu')

const WORDS: [PlaceCategory[], RegExp[]][] = [
  [['hospital'], [stemOf('больниц'), stemOf('госпитал'), stemOf('скор(?:ая|ой) помощ'), stemOf('травмпункт')]],
  [['clinic'], [stemOf('клиник'), stemOf('поликлиник'), stemOf('врач'), stemOf('доктор')]],
  [['pharmacy'], [stemOf('аптек')]],
  [['bar'], [word('бар', '|ы|а|ов|е|ом|ам|ами|ах'), stemOf('паб')]],
  [['nightclub'], [stemOf('клуб'), stemOf('дискотек'), stemOf('ночн(?:ая|ой|ую) жизн'), stemOf('тусов')]],
  [['restaurant'], [stemOf('ресторан'), stemOf('поесть'), stemOf('поужинать'), stemOf('пообедать')]],
  [['cafe'], [word('кафе'), stemOf('кофейн')]],
  [
    ['supermarket', 'convenience'],
    [stemOf('супермаркет'), stemOf('магазин'), stemOf('продукт')],
  ],
  [['metro'], [word('метро')]],
  [['tram'], [stemOf('трамва')]],
  [['train_station'], [stemOf('вокзал'), word('поезд', '|а|ом|е|ов|ами'), stemOf('электричк')]],
  [['bus_stop'], [stemOf('автобус'), stemOf('остановк')]],
  [['airport'], [stemOf('аэропорт')]],
  // The sea is measured to the nearest beach: the coastline of a port is no sea to swim in.
  [
    ['beach', 'sea'],
    [word('мор', 'е|я|ю|ем'), stemOf('морск'), stemOf('пляж'), stemOf('побереж')],
  ],
  [['park'], [word('парк', '|и|а|ов|е|ом|ам|ах')]],
  [['museum'], [stemOf('музе')]],
  [['viewpoint'], [stemOf('смотров')]],
  [['attraction'], [stemOf('достопримечат'), /что посмотреть|куда сходить/i]],
  // «Центр», not «Центральный рынок»: a named place is geocoded.
  [['centre'], [word('центр', '|а|е|у|ом')]],
]

const NEARBY = /рядом|поблизости|недалеко|вокруг|окрестност|в шаговой|близко/i
const DISTANCE =
  /сколько\s+(?:идти|ехать|пешком|до|минут|км|метров)|далеко|пешком|на такси|на машине|доехать|дойти|добраться/i

/** What «Что рядом?» asks without a category: the everyday places of a stay. */
export const EVERYDAY: readonly PlaceCategory[] = ['attraction', 'restaurant', 'supermarket', 'pharmacy', 'metro']

/** The categories the words name, in the order of `WORDS`, at most 6. */
export function questionCategories(text: string): PlaceCategory[] {
  const named = WORDS.flatMap(([categories, words]) => (words.some((w) => w.test(text)) ? categories : []))
  return [...new Set(named)].slice(0, 6)
}

/** Where the name after «до» ends: the words of the way, of the question and of the hotel. */
const NAME_END = /^(?:пешком|на|от|по|за|сколько|можно|далеко|идти|ехать|добраться|доехать|дойти|ли|это|отеля)$/iu
/** What follows «до» but is no place's name: the hotel, the time, the end of the stay. */
const NOT_A_NAME = /^(?:отеля|гостиницы|меня|нас|вас|\d)/iu

/**
 * The name of a place after «до» in a question («сколько идти до Центрального рынка?» → «Центрального рынка»), which
 * the geo tools look up by its name; `undefined` when «до» is followed by a kind of place («до метро») or by no name.
 */
export function placeAfterTo(text: string): string | undefined {
  const match = /(?<!\p{L})до\s+([^?!.,;\n]+)/iu.exec(text)
  if (!match) return undefined
  const words: string[] = []
  for (const word of match[1].trim().split(/\s+/)) {
    if (words.length >= 8 || (words.length > 0 && NAME_END.test(word))) break
    words.push(word)
  }
  const name = words.join(' ')
  if (name.length < 3 || NOT_A_NAME.test(name) || questionCategories(name).length > 0) return undefined
  return name
}

/** A question about the places near the hotel or the way to one. */
export const isGeoQuestion = (text: string) =>
  NEARBY.test(text) || DISTANCE.test(text) || questionCategories(text).length > 0

/** The far categories need a large radius: the airport is 10 km away, the coast of a city a few km. */
export const FAR_RADIUS_M = 20_000
/** «Рядом» for the rules: about 15 minutes on foot. */
export const NEAR_RADIUS_M = 1500
