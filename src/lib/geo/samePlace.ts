import type { Tags } from './categories'
import { haversineMeters, type LatLon } from './distance'

/**
 * One place of Ostrovok and OpenStreetMap, once. Ostrovok names a place twice now and then («Ла-Лонья» and
 * «Лонха-де-ла-Седа», 53 m apart) and OSM has it too («Llotja de la Seda»); «Что рядом», the landmarks of «Вид из
 * отеля», Эвал's geo answers and the map of the chat fold them with `mergePlaces`. The first Ostrovok place of the
 * same ones stays with its name and data; an OSM place is only what Ostrovok does not have. No `server-only`: the
 * page's details and the tests use it too.
 *
 * Two places are one when their kinds may be one (`groupOf`: a museum and a historic building, never a museum and a
 * café at its door) and
 * - their names agree (a word of a name or of its translations, the kind words and «Valencia» aside) within
 *   `NAMED_M` (`NAMED_AREA_M` for a park or a beach), or
 * - one is the only place of a kind it may be within `SAME_M` of the other, and the other has no namesake near:
 *   two museums 5 and 21 m from an Ostrovok museum of another name are both kept;
 * - an airport is the airport of the same kind within `AIRPORT_M`: its points stand a kilometre apart.
 */

/** Without a name in common, a place this near is the same one, when it is the only one. */
export const SAME_M = 30
/** With a name in common, this near: a palace or a market is big, the points of the two sources stand apart. */
export const NAMED_M = 150
/** A park or a beach is bigger still: their points stand hundreds of metres apart with a name in common. */
export const NAMED_AREA_M = 600
/** The points of an airport in the two sources stand this far apart. */
export const AIRPORT_M = 3000

export interface OstrovokLike extends LatLon {
  name: string
  /** The English name of Ostrovok: it shares words with the names of OSM. */
  nameEn?: string
  /** The names of the Ostrovok places folded into it (`MergedPlace.twins`). */
  aliases?: readonly string[]
  /** «Музей», «Станция», … (src/lib/ota/page.ts `placeKind`). */
  kind: string
}

export interface OsmLike extends LatLon {
  name: string | null
  /** The category of src/lib/geo/categories.ts the place was found for. */
  category: string
  /** The names in other languages, the old and the other names (`name:es`, `old_name`, …). */
  tags?: Tags
  /** The element: the same one found for two categories is folded once. */
  osmType?: string
  osmId?: number
}

/** The kinds of the two sources that may be one place. */
const OSTROVOK_GROUP: Record<string, string> = {
  Достопримечательность: 'sight',
  Музей: 'sight',
  Храм: 'sight',
  Место: 'sight',
  Парк: 'park',
  Пляж: 'beach',
  Больница: 'hospital',
  Станция: 'station',
  Аэропорт: 'airport',
}
const OSM_GROUP: Record<string, string> = {
  attraction: 'sight',
  museum: 'sight',
  park: 'park',
  beach: 'beach',
  hospital: 'hospital',
  metro: 'station',
  tram: 'station',
  train_station: 'station',
  airport: 'airport',
}

/** The group of an Ostrovok kind: a kind of its own when OSM has none like it (two theatres are one theatre). */
export const groupOf = (kind: string) => OSTROVOK_GROUP[kind] ?? `ostrovok:${kind}`
/** The group of an OSM category; a café, a bar or a bus stop is never an Ostrovok place. */
const osmGroupOf = (category: string) => OSM_GROUP[category]

/** The words that say the kind or the city, not which place: «музей», «la», «Valencia». */
const STOP = new Set(
  [
    'the of and del dels des les las los per por with для при имени им',
    'san sant santa santo saint св сан санта',
    'museum museo museu musee музей дом-музей house casa дом',
    'church iglesia esglesia parroquia церковь собор cathedral catedral basilica базилика монастырь monastery',
    'park parc parque парк garden gardens jardin jardi jardins jardines сад сады tram tramo',
    'beach platja playa пляж',
    'hospital hospitalario больница clinic clinica',
    'station estacion estacio станция metro метро',
    'airport aeropuerto aeroport аэропорт international internacional',
    'plaza placa square площадь palace palau palacio дворец',
    'market mercado mercat рынок',
    'theatre theater teatro teatre театр',
    'valencia valencian валенсия валенсии валенсийский city ciudad ciutat город городская городской',
    'centre center centro центр national nacional национальный municipal tower towers torre torres башни башня',
    'bridge puente pont мост building edificio здание',
  ]
    .join(' ')
    .split(' '),
)

/** The words of a name, lower case, without the accents: «Plaça d'Espanya» → `espanya`. */
export function nameWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP.has(word))
}

/** The same word or its form: `militar`/`military`, `universitari`/`university`, `колон`/`колон`. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = Math.min(a.length, b.length)
  let common = 0
  while (common < shorter && a[common] === b[common]) common += 1
  return common >= 5 && common >= shorter - 1
}

const NAME_TAG = /^(?:name|alt_name|old_name|short_name|official_name|loc_name)(?::[a-z]{2,3})?$/

const osmNames = (place: OsmLike) => [
  ...(place.name ? [place.name] : []),
  ...Object.entries(place.tags ?? {}).flatMap(([key, value]) => (NAME_TAG.test(key) ? [value] : [])),
]

const ostrovokNames = (place: OstrovokLike) => [
  place.name,
  ...(place.nameEn ? [place.nameEn] : []),
  ...(place.aliases ?? []),
]

/** Whether two lists of names share a word. */
export function namesAgree(a: readonly string[], b: readonly string[]): boolean {
  const words = a.flatMap(nameWords)
  return b.flatMap(nameWords).some((word) => words.some((other) => sameWord(word, other)))
}

/** An Ostrovok place and the ones that are it. */
export interface MergedPlace<O, M> {
  place: O
  /** The other Ostrovok places that are it: their names are not shown. */
  twins: O[]
  /** The OSM places that are it. */
  osm: M[]
}

export interface MergedPlaces<O, M> {
  /** The Ostrovok places, in their order, each once. */
  ostrovok: MergedPlace<O, M>[]
  /** The OSM places no Ostrovok place is, in their order: what OSM adds. */
  osm: M[]
}

const nearest = (members: readonly LatLon[], point: LatLon) =>
  Math.min(...members.map((m) => haversineMeters(m, point)))

interface Candidate {
  /** The index of the place matched. */
  at: number
  distanceM: number
  named: boolean
}

/**
 * The places that are one place of a group: a namesake within `NAMED_M` or `NAMED_AREA_M` (the nearest), else the only place within
 * `SAME_M`, else none; an airport is the nearest airport within `AIRPORT_M`.
 */
function pick(candidates: readonly Candidate[], group: string): Candidate | undefined {
  const byDistance = [...candidates].sort((a, b) => a.distanceM - b.distanceM)
  if (group === 'airport') return byDistance.find((c) => c.distanceM <= AIRPORT_M)
  const namedM = group === 'park' || group === 'beach' ? NAMED_AREA_M : NAMED_M
  const named = byDistance.find((c) => c.named && c.distanceM <= namedM)
  if (named) return named
  const close = byDistance.filter((c) => c.distanceM <= SAME_M)
  return close.length === 1 ? close[0] : undefined
}

/**
 * The places of Ostrovok and of OSM, each place once: the Ostrovok places that are one folded into the first, and
 * each OSM place that is an Ostrovok one folded into it (its name and data are not shown); the rest of OSM is what
 * it adds. A place is matched with the rule of the module's comment.
 */
export function mergePlaces<O extends OstrovokLike, M extends OsmLike>(
  ostrovok: readonly O[],
  osm: readonly M[] = [],
): MergedPlaces<O, M> {
  const merged: MergedPlace<O, M>[] = []
  for (const place of ostrovok) {
    const group = groupOf(place.kind)
    const names = ostrovokNames(place)
    const candidates = merged.flatMap((m, at): Candidate[] =>
      groupOf(m.place.kind) === group
        ? [
            {
              at,
              distanceM: nearest([m.place, ...m.twins], place),
              named: namesAgree(names, [m.place, ...m.twins].flatMap(ostrovokNames)),
            },
          ]
        : [],
    )
    const same = pick(candidates, group)
    if (same) merged[same.at].twins.push(place)
    else merged.push({ place, twins: [], osm: [] })
  }

  const key = (place: M, i: number) =>
    place.osmType && place.osmId !== undefined ? `${place.osmType}/${place.osmId}` : `#${i}`
  // Each Ostrovok place takes its namesakes first; one without a namesake takes the only place near, when it is
  // the only place near it too.
  const taken = new Map<string, number>()
  const close = new Map<number, Set<string>>()
  const lonely: { key: string; at: number }[] = []
  osm.forEach((place, i) => {
    const group = osmGroupOf(place.category)
    if (!group || taken.has(key(place, i))) return
    const names = osmNames(place)
    const candidates = merged.flatMap((m, at): Candidate[] =>
      groupOf(m.place.kind) === group
        ? [
            {
              at,
              distanceM: nearest([m.place, ...m.twins], place),
              named: names.length > 0 && namesAgree(names, [m.place, ...m.twins].flatMap(ostrovokNames)),
            },
          ]
        : [],
    )
    const same = pick(candidates, group)
    if (!same) return
    if (same.named || group === 'airport') taken.set(key(place, i), same.at)
    else {
      lonely.push({ key: key(place, i), at: same.at })
      // The places near one Ostrovok place, by their name: a node and the building of one museum are one.
      const nearIt = close.get(same.at) ?? new Set<string>()
      nearIt.add(place.name ? nameWords(place.name).join(' ') || place.name : key(place, i))
      close.set(same.at, nearIt)
    }
  })
  const hasNamesake = new Set(taken.values())
  for (const { key: k, at } of lonely)
    if (!taken.has(k) && !hasNamesake.has(at) && close.get(at)!.size === 1) taken.set(k, at)

  const rest: M[] = []
  osm.forEach((place, i) => {
    const at = taken.get(key(place, i))
    if (at === undefined) rest.push(place)
    else merged[at].osm.push(place)
  })
  return { ostrovok: merged, osm: rest }
}

/**
 * The Ostrovok places, the ones that are one place folded into the first; their names stay its `aliases`, so the
 * same place of OSM is found by any of them later.
 */
export const mergeOstrovok = <O extends OstrovokLike>(places: readonly O[]): O[] =>
  mergePlaces(places).ostrovok.map(({ place, twins }) =>
    twins.length ? { ...place, aliases: [...(place.aliases ?? []), ...twins.flatMap(ostrovokNames)] } : place,
  )
