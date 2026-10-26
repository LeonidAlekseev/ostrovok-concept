import { countRu } from './format'

/**
 * What Эвал picks hotels by beyond the catalogue (`hotel_features`, `hotel_room_views`, filled by
 * `npm run db:features`): the building's floors and height, the noise at the hotel and the views of its room types.
 * Only Valencia has the data; a hotel without it has no entry, and Эвал says so instead of guessing.
 */

export type ViewKind =
  'sea' | 'water' | 'city' | 'garden' | 'park' | 'courtyard' | 'pool' | 'mountain' | 'street' | 'nice'

/** «с видом …» */
export const VIEW_LABEL: Record<ViewKind, string> = {
  sea: 'на море',
  water: 'на воду',
  city: 'на город',
  garden: 'на сад',
  park: 'на парк',
  courtyard: 'во двор',
  pool: 'на бассейн',
  mountain: 'на горы',
  street: 'на улицу',
  nice: 'из окна',
}

/** A 5 dB band of a noise map; a missing bound is the open end («ниже 40», «70 и выше»). */
export interface NoiseBand {
  min?: number
  max?: number
}

export interface RoomView {
  roomName: string
  view: ViewKind
}

export interface HotelFeatures {
  floors?: number
  heightM?: number
  /** The loudest band at the hotel over the day, evening and night (Lden) and at night (Lnight). */
  lden?: NoiseBand
  lnight?: NoiseBand
  /** The room types with a view, as their names say. */
  views: RoomView[]
  /**
   * The building at the hotel's point is doubtful: the hotel says its rooms take more floors than the building has
   * (`isDoubtfulBuilding`), so its floors and height are dropped.
   */
  buildingDoubtful?: true
}

/**
 * The building EUBUCCO found at the hotel's point cannot be the hotel's when the hotel's rooms take more floors (as the
 * hotel says, Ostrovok's `floorsNumber`) than the building has: the point matched another building.
 */
export const isDoubtfulBuilding = (buildingFloors: number | null | undefined, roomFloors: number | null | undefined) =>
  Boolean(buildingFloors && roomFloors && roomFloors > buildingFloors)

/**
 * The features without the doubtful buildings' floors and height (`isDoubtfulBuilding`), marked `buildingDoubtful`;
 * `roomFloors` are the floors each hotel's rooms take, by hotel id.
 */
export function withoutDoubtfulBuildings(
  features: ReadonlyMap<string, HotelFeatures>,
  roomFloors: ReadonlyMap<string, number>,
): Map<string, HotelFeatures> {
  return new Map(
    [...features].map(([id, f]) => {
      if (!isDoubtfulBuilding(f.floors, roomFloors.get(id))) return [id, f]
      const { floors: _floors, heightM: _height, ...rest } = f
      return [id, { ...rest, buildingDoubtful: true as const }]
    }),
  )
}

/** What the traveller asked of the hotel. */
export type Criterion = 'quiet' | 'height' | 'view'

export const CRITERION_LABEL: Record<Criterion, string> = {
  quiet: 'шуме',
  height: 'этажности',
  view: 'виде из окна',
}

/** The criteria of a request: a quiet place, a taller or a lower building, a view from the window. */
export interface FeatureWish {
  quiet?: true
  height?: 'high' | 'low'
  view?: ViewKind | 'any'
}

export const criteriaOf = (wish: FeatureWish): Criterion[] => [
  ...(wish.quiet ? (['quiet'] as const) : []),
  ...(wish.height ? (['height'] as const) : []),
  ...(wish.view ? (['view'] as const) : []),
]

// The views of the room names: Russian first, the hotels' own English after.
const VIEW_RULES: [ViewKind, RegExp][] = [
  ['sea', /видом на (?:море|океан|пляж|залив)|sea view|ocean view/i],
  ['water', /видом на (?:воду|реку|озеро|канал|гавань|порт)|water view|river view/i],
  ['mountain', /видом на горы|mountain view/i],
  ['park', /видом на парк|park view/i],
  ['garden', /видом на сад|garden view/i],
  ['pool', /видом на бассейн|pool view/i],
  ['courtyard', /видом на (?:внутренний )?двор|courtyard view|interior view/i],
  ['street', /видом на улицу|street view/i],
  ['city', /видом на (?:город|площадь|city|собор|набережную)|city view|plaza view/i],
  ['nice', /видом из окна/i],
]

/** The views a room's name tells of: «Люкс с балконом и с видом на море» is `sea`; a balcony alone is none. */
export const viewsOfRoomName = (name: string): ViewKind[] =>
  VIEW_RULES.filter(([, re]) => re.test(name)).map(([view]) => view)

/** «45–49 дБ», «ниже 40 дБ», «70 дБ и выше». */
export function bandLabel({ min, max }: NoiseBand): string {
  if (min === undefined && max !== undefined) return `ниже ${max + 1} дБ`
  if (max === undefined && min !== undefined) return `${min} дБ и выше`
  return `${min}–${max} дБ`
}

/** The quietest band is the lowest; a band without an upper bound is the loudest. */
const loudness = (band: NoiseBand) => band.max ?? (band.min ?? 0) + 5

/** The room views that answer the wish: any view but the street for «с видом», the very one otherwise. */
export const matchingViews = (features: HotelFeatures | undefined, view: FeatureWish['view']): RoomView[] =>
  !features || !view
    ? []
    : features.views.filter((v) =>
        view === 'any' ? v.view !== 'street' : v.view === view || (view === 'water' && v.view === 'sea'),
      )

const has = (features: HotelFeatures | undefined, criterion: Criterion, wish: FeatureWish): boolean => {
  if (!features) return false
  if (criterion === 'quiet') return features.lnight !== undefined
  if (criterion === 'height') return features.floors !== undefined
  return matchingViews(features, wish.view).length > 0
}

/**
 * Why the hotel fits the wish, one line a criterion: «тихо ночью: ниже 40 дБ», «здание 12 этажей», «в описаниях номеров
 * отеля есть вид на море»; «нет данных о шуме» when the hotel has no data for it.
 */
export function featureReasons(features: HotelFeatures | undefined, wish: FeatureWish): string[] {
  return criteriaOf(wish).map((criterion) => {
    if (!has(features, criterion, wish))
      // A hotel with data had its room names read: none of them tells of the view.
      return criterion === 'view' && features
        ? `в описаниях номеров отеля нет вида ${wish.view === 'any' ? 'из окна' : VIEW_LABEL[wish.view!]}`
        : `нет данных о ${CRITERION_LABEL[criterion]}`
    const f = features!
    if (criterion === 'quiet') return `ночью ${bandLabel(f.lnight!)}${f.lden ? `, за сутки ${bandLabel(f.lden)}` : ''}`
    if (criterion === 'height')
      return `здание ${countRu(f.floors!, ['этаж', 'этажа', 'этажей'])}${f.heightM ? `, ${Math.round(f.heightM)} м` : ''}`
    const rooms = matchingViews(f, wish.view)
    const label = wish.view === 'any' ? VIEW_LABEL[rooms[0].view] : VIEW_LABEL[wish.view!]
    // The room types are a directory of names from the suppliers, not the rooms on sale: no room is promised.
    return `в описаниях номеров отеля есть вид ${label}`
  })
}

/**
 * The hotels of `ids` that have the data for every criterion of the wish, best first: a room with the view, then the
 * quietest night band, then the tallest (or the lowest) building; ties keep the order of `ids` (the search by
 * meaning's). Empty when no criteria were asked.
 */
export function rankByFeatures(
  ids: readonly string[],
  features: ReadonlyMap<string, HotelFeatures>,
  wish: FeatureWish,
): string[] {
  const criteria = criteriaOf(wish)
  if (criteria.length === 0) return []
  const order = new Map(ids.map((id, index) => [id, index]))
  return ids
    .filter((id) => criteria.every((c) => has(features.get(id), c, wish)))
    .sort((a, b) => {
      const fa = features.get(a)!
      const fb = features.get(b)!
      if (wish.quiet) {
        const d = loudness(fa.lnight!) - loudness(fb.lnight!)
        if (d) return d
      }
      if (wish.height) {
        const d = (fb.floors! - fa.floors!) * (wish.height === 'high' ? 1 : -1)
        if (d) return d
      }
      if (wish.quiet && fa.lden && fb.lden) {
        const d = loudness(fa.lden) - loudness(fb.lden)
        if (d) return d
      }
      return order.get(a)! - order.get(b)!
    })
}

/** The criteria no hotel of `ids` has data for: Эвал says so. */
export const missingCriteria = (
  ids: readonly string[],
  features: ReadonlyMap<string, HotelFeatures>,
  wish: FeatureWish,
): Criterion[] => criteriaOf(wish).filter((c) => !ids.some((id) => has(features.get(id), c, wish)))

/** The lines of the hotel's text for the search by meaning: what a traveller asks about, without guessing. */
export function featureLines(features: HotelFeatures | undefined): string[] {
  if (!features) return []
  const lines: string[] = []
  if (features.floors)
    lines.push(
      `Здание: ${countRu(features.floors, ['этаж', 'этажа', 'этажей'])}${features.heightM ? `, высота ${Math.round(features.heightM)} м` : ''}.`,
    )
  if (features.lnight || features.lden)
    lines.push(
      `Шум по карте шума: ${[
        features.lnight && `ночью ${bandLabel(features.lnight)}`,
        features.lden && `за сутки ${bandLabel(features.lden)}`,
      ]
        .filter(Boolean)
        .join(', ')}${features.lnight && loudness(features.lnight) <= 45 ? ' — тихо ночью' : ''}.`,
    )
  const views = [...new Set(features.views.map((v) => v.view))]
  if (views.length) lines.push(`В описаниях номеров отеля есть вид ${views.map((v) => VIEW_LABEL[v]).join(', ')}.`)
  return lines
}

/** A row of `hotel_features` as read. */
export interface FeatureRowRead {
  hotel_id: string
  floors: number | null
  height_m: number | null
  lden_min: number | null
  lden_max: number | null
  lnight_min: number | null
  lnight_max: number | null
}

/** A row of `hotel_room_views_named` as read. */
export interface RoomViewRowRead {
  hotel_id: string | null
  view: string | null
  room_name: string | null
}

const band = (min: number | null, max: number | null): NoiseBand | undefined =>
  min === null && max === null ? undefined : { ...(min !== null && { min }), ...(max !== null && { max }) }

/** The features of the hotels with data, by hotel id, from the rows of the tables. */
export function featuresOf(
  hotels: readonly FeatureRowRead[],
  views: readonly RoomViewRowRead[],
): Map<string, HotelFeatures> {
  const byId = new Map<string, HotelFeatures>()
  for (const row of hotels) {
    const lden = band(row.lden_min, row.lden_max)
    const lnight = band(row.lnight_min, row.lnight_max)
    byId.set(row.hotel_id, {
      ...(row.floors !== null && { floors: row.floors }),
      ...(row.height_m !== null && { heightM: row.height_m }),
      ...(lden && { lden }),
      ...(lnight && { lnight }),
      views: [],
    })
  }
  for (const { hotel_id, view, room_name } of views) {
    if (!hotel_id || !room_name || !view || !Object.hasOwn(VIEW_LABEL, view)) continue
    const features = byId.get(hotel_id) ?? { views: [] }
    features.views.push({ roomName: room_name, view: view as ViewKind })
    byId.set(hotel_id, features)
  }
  return byId
}
