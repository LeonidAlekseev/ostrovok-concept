import { confidenceFor, type ConfidenceKind } from './confidence'
import {
  FACADE_BUFFER_M,
  FACADE_CIRCLE_M,
  NOISE_ESTIMATE_METHOD,
  NOISY_CATEGORIES,
  NOISY_RADIUS_M,
  VENUE_LEVELS,
  VENUE_MIN_DISTANCE_M,
  VENUE_REFERENCE_M,
  dayEstimate,
  facadeOf,
  isVenue,
  noiseEstimate,
  noisyRank,
  type LevelRange,
  type NoisePeriod,
  type NoisyCategory,
  type SideLevels,
  type SourceNoise,
} from './noise'
import type { NoiseBand } from './features'
import { viewRows, type RoomGroup } from './featureRows'
import { mergePlaces, type OsmLike, type OstrovokLike } from './geo/samePlace'
import { placeKind } from './ota/page'

/**
 * The rows of the store of claims (supabase/migrations/20261027220000_claims_evidence_store.sql) that
 * `npm run db:features` writes for the real hotels: pure, so the tests check what goes to the database. The rows point
 * at each other by their natural keys (`entityKey`, `evidenceKey`, `claimKey`, the calculation's `key`); the script
 * turns the keys into the ids of the database. Only what the sources give: EEA's bands at the hotel's point, the day
 * estimate from them, the loud OSM places within `NOISY_RADIUS_M`, the places of everyday need within `NEARBY_RADIUS_M`
 * (Ostrovok's first), the nearest building of EUBUCCO, the guests' reviews and their words about noise and quiet. A
 * hotel outside the EEA contours has no band (not «тихо»), a review without such words no claim (not «тихо» either), a
 * category with no place nearby no claim (not «нет»). Each claim has the confidence of src/lib/confidence.ts.
 */

export type EpistemicStatus = 'observed' | 'reported' | 'derived' | 'inferred'
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

export interface EntityRow {
  kind: 'hotel' | 'room' | 'osm_place' | 'building' | 'ota_poi'
  ref: string
  hotel_id: string | null
  name: string | null
  /** Where a place is: `{ lat, lon }` of an `osm_place` or `ota_poi`; absent for the rest (stored as `{}`). */
  metadata?: JsonObject
}

export interface EvidenceRow {
  type: 'dataset' | 'osm' | 'review' | 'ota_page'
  title: string
  provider: string
  external_id: string
  url: string | null
  retrieved_at: string | null
  excerpt: string | null
  metadata: JsonObject
  dataset_id: string | null
}

export interface CalculationRow {
  key: string
  method: string
  version: string
  inputs: JsonObject
  parameters: JsonObject
  limitations: string[]
}

/** A claim's evidence, by its key, and what it is for the claim: the source it reports or an input of its calculation. */
export interface ClaimEvidenceRef {
  evidence: string
  role: 'source' | 'input'
}

export interface ClaimRow {
  /** `entityKey` of the entity the claim is about. */
  entity: string
  property: string
  source_key: string
  value_numeric: number | null
  value_min: number | null
  value_max: number | null
  value_text: string | null
  unit: string | null
  epistemic_status: EpistemicStatus
  /** The policy's (src/lib/confidence.ts): never null for a claim of the script. */
  confidence: number
  /** With `confidence`: the policy's version and rule. */
  method: JsonObject
  /** The `key` of its calculation, for a derived claim. */
  calculation: string | null
  observed_at: string | null
  limitations: string[]
  evidence: ClaimEvidenceRef[]
}

export interface RelationRow {
  subject: string
  /** `near`: a place around the hotel; `nearest_building`: the building nearest to its point (`BUILDING_RADIUS_M`). */
  predicate: 'near' | 'nearest_building'
  object: string
  /** `claimKey` of the claim of the edge's value (the distance). */
  claim: string | null
  evidence: string | null
  /** Its claim's. */
  confidence: number
}

export interface ChunkRow {
  ord: number
  text: string
  metadata: JsonObject
}

export interface DocumentRow {
  /** `evidenceKey` of the document's source: one document per evidence. */
  evidence: string
  kind: 'review'
  hotel_id: string
  entity: string
  language: string | null
  text: string
  metadata: JsonObject
  chunks: ChunkRow[]
}

export interface Store {
  entities: EntityRow[]
  evidence: EvidenceRow[]
  calculations: CalculationRow[]
  claims: ClaimRow[]
  relations: RelationRow[]
  documents: DocumentRow[]
}

export const entityKey = (row: Pick<EntityRow, 'kind' | 'ref'>) => `${row.kind}:${row.ref}`
export const evidenceKey = (row: Pick<EvidenceRow, 'provider' | 'external_id'>) => `${row.provider}:${row.external_id}`
export const claimKey = (row: Pick<ClaimRow, 'entity' | 'property' | 'source_key'>) =>
  `${row.entity}|${row.property}|${row.source_key}`

/** The providers of the evidence the script writes: what it may update and delete, and nothing else. */
export const EEA = 'EEA'
export const OSM = 'OpenStreetMap'
export const OSTROVOK = 'Островок'
export const EUBUCCO = 'EUBUCCO'

/** The claim's confidence by the policy, and its method with the policy's version and rule. */
const rated = (kind: ConfidenceKind, method: JsonObject) => {
  const { confidence, method: policy } = confidenceFor(kind)
  return { confidence, method: { ...method, confidence: policy } }
}

/** A real hotel of the catalogue. */
export interface ClaimHotel {
  id: string
  name: string | null
  lat: number
  lon: number
}

/** A row of `geo_datasets`. */
export interface Dataset {
  id: string
  name: string
  version: string
  url: string
  extract: string
  processing: string
  loaded_at: string
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
/** An ISO time of the source's own value, or null: a date is never made up. */
const time = (value: unknown) => {
  const raw = text(value)
  if (!raw) return null
  const ms = Date.parse(raw.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

const hotelEntity = (hotel: ClaimHotel): EntityRow => ({
  kind: 'hotel',
  ref: hotel.id,
  hotel_id: hotel.id,
  name: text(hotel.name),
})

/** The evidence of a dataset of `geo_datasets`. */
export const datasetEvidence = (dataset: Dataset, provider: string): EvidenceRow => ({
  type: 'dataset',
  title: `${dataset.name} ${dataset.version}`,
  provider,
  external_id: dataset.id,
  url: dataset.url,
  retrieved_at: time(dataset.loaded_at),
  excerpt: null,
  metadata: { version: dataset.version, extract: dataset.extract, processing: dataset.processing },
  dataset_id: dataset.id,
})

/** What every EEA band is and is not. */
export const EEA_LIMITATIONS = [
  'Модельная стратегическая карта шума EEA (END, раунд 2022), не измерение у окна',
  'Полоса 5 дБ, а не уровень',
]

/** A row of `hotel_geo().noise`: the band of one layer and indicator at the point. */
const geoBand = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const source = text(row.source)
  const indicator = row.indicator === 'Lden' || row.indicator === 'Lnight' ? row.indicator : null
  const min = finite(row.db_min)
  const max = finite(row.db_max)
  if (!source || !indicator || (min === null && max === null) || !/^[A-Za-z0-9_]+$/.test(source)) return null
  return { source, indicator, min, max, category: text(row.category), dataset: text(row.dataset) }
}

const bandOf = (min: number | null, max: number | null): NoiseBand => ({
  ...(min !== null && { min }),
  ...(max !== null && { max }),
})

/** A day estimate's bound, to 0.1 dB; an infinite bound is an open end. */
const dayBound = (value: number) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null)

export const DAY_METHOD = 'Директива ЕС 2002/49/EC, приложение I: Lday из Lden и Lnight'
export const DAY_VERSION = 'dayEstimate-1'

/**
 * The EEA bands at the hotel's point by layer (`reported`, the dataset as their evidence) and, for a layer with both
 * bands, the day estimate of `dayEstimate` (`derived`, with its calculation). Nothing for a point outside the contours.
 */
export function noiseStore(hotel: ClaimHotel, noise: readonly unknown[], datasets: readonly Dataset[]): Store {
  const hotelKey = entityKey(hotelEntity(hotel))
  const byId = new Map(datasets.map((d) => [d.id, d]))
  const evidence = new Map<string, EvidenceRow>()
  const claims: ClaimRow[] = []
  const calculations: CalculationRow[] = []
  const layers = new Map<string, { lden?: NoiseBand; lnight?: NoiseBand; dataset: string }>()
  for (const value of noise) {
    const band = geoBand(value)
    const dataset = band?.dataset ? byId.get(band.dataset) : undefined
    if (!band || !dataset) continue
    const source = datasetEvidence(dataset, EEA)
    evidence.set(evidenceKey(source), source)
    const indicator = band.indicator === 'Lden' ? 'lden' : 'lnight'
    claims.push({
      entity: hotelKey,
      property: `noise.${indicator}.${band.source}`,
      source_key: '',
      value_numeric: null,
      value_min: band.min,
      value_max: band.max,
      value_text: null,
      unit: 'dB',
      epistemic_status: 'reported',
      ...rated('eea_band', { layer: band.source, indicator: band.indicator, category: band.category }),
      calculation: null,
      observed_at: null,
      limitations:
        band.min === null
          ? [...EEA_LIMITATIONS, 'Нижняя полоса открыта: ниже 40 дБ карта уровни не различает']
          : EEA_LIMITATIONS,
      evidence: [{ evidence: evidenceKey(source), role: 'source' }],
    })
    const layer = layers.get(band.source) ?? { dataset: evidenceKey(source) }
    layer[indicator] = bandOf(band.min, band.max)
    layers.set(band.source, layer)
  }
  for (const [layer, { lden, lnight, dataset }] of layers) {
    const day = dayEstimate(lden, lnight)
    const min = day && dayBound(day.min)
    const max = day && dayBound(day.max)
    if (!day || (min === null && max === null)) continue
    const key = `noise.lday:${hotel.id}:${layer}`
    calculations.push({
      key,
      method: DAY_METHOD,
      version: DAY_VERSION,
      inputs: {
        hotel_id: hotel.id,
        layer,
        lden: { min: lden?.min ?? null, max: lden?.max ?? null },
        lnight: { min: lnight?.min ?? null, max: lnight?.max ?? null },
      },
      parameters: {
        day_hours: 12,
        evening_hours: 4,
        night_hours: 8,
        evening_penalty_db: 5,
        night_penalty_db: 10,
        evening_equals_day: true,
        day_not_quieter_than_night: true,
      },
      limitations: [
        'Допущение: вечер так же громок, как день',
        'Допущение: день не тише ночи',
        'Оценка из полос 5 дБ модельной карты, не измерение',
      ],
    })
    claims.push({
      entity: hotelKey,
      property: `noise.lday.estimate.${layer}`,
      source_key: '',
      value_numeric: null,
      value_min: min,
      value_max: max,
      value_text: null,
      unit: 'dB',
      epistemic_status: 'derived',
      ...rated('day_estimate', { layer, from: ['Lden', 'Lnight'] }),
      calculation: key,
      observed_at: null,
      limitations: ['Оценка по допущению «вечер = день», не измерение'],
      evidence: [{ evidence: dataset, role: 'input' }],
    })
  }
  return {
    entities: claims.length > 0 ? [hotelEntity(hotel)] : [],
    evidence: [...evidence.values()],
    calculations,
    claims,
    relations: [],
    documents: [],
  }
}

const NOISY = new Set<string>(NOISY_CATEGORIES)

/** A place of an `osm_places_near` answer of a `wanted` category, the parts read here. */
const nearPlace = (value: unknown, wanted: ReadonlySet<string> = NOISY) => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const type = row.osm_type === 'node' || row.osm_type === 'way' || row.osm_type === 'relation' ? row.osm_type : null
  const id = finite(row.osm_id)
  const category = text(row.category)
  const distance = finite(row.distance_m)
  if (!type || id === null || !Number.isInteger(id) || !category || !wanted.has(category) || distance === null)
    return null
  return {
    ref: `${type}/${id}`,
    type,
    id,
    category,
    lat: finite(row.lat),
    lon: finite(row.lon),
    tags:
      row.tags && typeof row.tags === 'object' && !Array.isArray(row.tags)
        ? Object.fromEntries(
            Object.entries(row.tags as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : {},
    categories: Array.isArray(row.categories) ? row.categories.filter((c): c is string => typeof c === 'string') : [],
    name: text(row.name),
    distance,
    fetchedAt: time(row.fetched_at),
    attribution: text(row.attribution),
    origin: text(row.origin),
  }
}

const osmEntity = (place: { ref: string; name: string | null; lat: number | null; lon: number | null }): EntityRow => ({
  kind: 'osm_place',
  ref: place.ref,
  hotel_id: null,
  name: place.name,
  ...(place.lat !== null && place.lon !== null && { metadata: { lat: place.lat, lon: place.lon } }),
})

const osmEvidence = (place: NonNullable<ReturnType<typeof nearPlace>>): EvidenceRow => ({
  type: 'osm',
  title: place.name ?? place.ref,
  provider: OSM,
  external_id: place.ref,
  url: `https://www.openstreetmap.org/${place.ref}`,
  retrieved_at: place.fetchedAt,
  excerpt: null,
  metadata: {
    categories: place.categories,
    ...(place.attribution && { attribution: place.attribution }),
    ...(place.origin && { origin: place.origin }),
  },
  dataset_id: null,
})

export const NEAR_METHOD =
  'osm_places_near_facade: расстояние по прямой от фасада здания отеля (контур EUBUCCO; от точки отеля, если здания нет) до формы объекта OSM'
export const NEAR_VERSION = 'osm_places_near_facade-1'

/**
 * The loud places of OSM around the hotel's facade (`osm_places_near_facade` over `NOISY_CATEGORIES`): each place an entity with its
 * OSM evidence and the edge hotel —near→ place, its distance a `derived` claim of the hotel's calculation, and the
 * count of each category found (`noise.nearby.<category>.count`, «20 и больше» at the answer's limit). A category with
 * no place gives no claim: OSM may lack it.
 */
export function nearbyStore(
  hotel: ClaimHotel,
  answer: unknown,
  { radiusM, perCategory }: { radiusM: number; perCategory: number },
): Store {
  const places = (
    answer && typeof answer === 'object' && Array.isArray((answer as { places?: unknown }).places)
      ? ((answer as { places: unknown[] }).places.map((p) => nearPlace(p)).filter(Boolean) as NonNullable<
          ReturnType<typeof nearPlace>
        >[])
      : []
  ).sort((a, b) => a.distance - b.distance || a.ref.localeCompare(b.ref))
  const empty: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  if (places.length === 0) return empty
  const hotelKey = entityKey(hotelEntity(hotel))
  const key = `noise.nearby:${hotel.id}`
  const store: Store = { ...empty, entities: [hotelEntity(hotel)] }
  store.calculations.push({
    key,
    method: NEAR_METHOD,
    version: NEAR_VERSION,
    inputs: { hotel_id: hotel.id, lat: hotel.lat, lon: hotel.lon },
    parameters: { radius_m: radiusM, per_category: perCategory, categories: [...NOISY_CATEGORIES] },
    limitations: [
      'Данные OpenStreetMap могут быть неполными: места нет в данных — не значит, что его нет на месте',
      'Расстояние по прямой от стены здания отеля до формы объекта, не путь пешком',
      `Не более ${perCategory} мест каждой категории`,
    ],
  })
  const byCategory = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (const place of places) {
    byCategory.set(place.category, (byCategory.get(place.category) ?? new Set()).add(place.ref))
    if (seen.has(place.ref)) continue
    seen.add(place.ref)
    const entity = osmEntity(place)
    const source = osmEvidence(place)
    const claim: ClaimRow = {
      entity: hotelKey,
      property: 'noise.nearby.distance',
      source_key: place.ref,
      value_numeric: place.distance,
      value_min: null,
      value_max: null,
      value_text: null,
      unit: 'm',
      epistemic_status: 'derived',
      ...rated('osm_distance_facade', { categories: place.categories.filter((c) => NOISY.has(c)) }),
      calculation: key,
      observed_at: null,
      limitations: [],
      evidence: [{ evidence: evidenceKey(source), role: 'input' }],
    }
    store.entities.push(entity)
    store.evidence.push(source)
    store.claims.push(claim)
    store.relations.push({
      subject: hotelKey,
      predicate: 'near',
      object: entityKey(entity),
      claim: claimKey(claim),
      evidence: evidenceKey(source),
      confidence: claim.confidence,
    })
  }
  for (const category of NOISY_CATEGORIES) {
    const refs = byCategory.get(category)
    if (!refs) continue
    const full = refs.size >= perCategory
    store.claims.push({
      entity: hotelKey,
      property: `noise.nearby.${category}.count`,
      source_key: '',
      value_numeric: full ? null : refs.size,
      value_min: full ? refs.size : null,
      value_max: null,
      value_text: null,
      unit: 'count',
      epistemic_status: 'derived',
      ...rated('osm_count', { category, radius_m: radiusM }),
      calculation: key,
      observed_at: null,
      limitations: full ? ['Ответ ограничен: мест может быть больше'] : [],
      evidence: [...refs].map((ref) => ({ evidence: `${OSM}:${ref}`, role: 'input' as const })),
    })
  }
  return store
}

export const ESTIMATE_METHOD =
  'Оценка шума у фасада: самые громкие (улица) и самые тихие (двор) полосы карт шума EEA у контура здания, энергетическая сумма слоёв и шумных мест OpenStreetMap как точечных источников'

/** What the estimate of noise-estimate-v2 does not take into account, for its calculation and the API's docs. */
export const ESTIMATE_LIMITATIONS = [
  'Модель, а не измерение: полосы стратегической карты шума EEA (END, раунд 2022) и типовые уровни заведений',
  'Здание отеля полностью экранирует двор от заведений (к окнам во двор они не прибавляются); другие здания между заведением и фасадом не учитываются',
  'Уровни снаружи у стены: окна, стены и звукоизоляция номеров не учитываются',
  'Уровни заведений — типовые для вида (терраса, открытая дверь), а не измерение конкретного места; часы работы не проверяются',
  'Расстояние до заведения — по прямой от фасада (контур здания отеля по EUBUCCO; от точки отеля, если здания нет); заведения, которых нет в OpenStreetMap, не учтены',
  'Дневной и вечерний уровни из Lden и Lnight при допущениях «вечер = день» и «день не тише ночи»',
]

/** The parameters of noise-estimate-v2, for the calculation's rows and the API's docs. */
export const ESTIMATE_PARAMETERS = {
  facade_buffer_m: FACADE_BUFFER_M,
  circle_radius_m: FACADE_CIRCLE_M,
  places_radius_m: NOISY_RADIUS_M,
  reference_distance_m: VENUE_REFERENCE_M,
  min_distance_m: VENUE_MIN_DISTANCE_M,
  venue_levels_db: VENUE_LEVELS,
  attenuation: 'L = Lref − 20·lg(d/10)',
  sum: '10·lg Σ10^(L/10)',
  lday: 'Директива ЕС 2002/49/EC, приложение I: Lday из Lden и Lnight (вечер = день, день не тише ночи)',
  periods: 'день 07–19, вечер 19–23, ночь 23–07',
} as const

/** A bound of an estimate, to 0.1 dB; an infinite one is an open end. */
const estimateBound = (value: number) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null)

const bandsJson = (sources: readonly SourceNoise[]): JsonObject =>
  Object.fromEntries(
    sources.map((s) => [
      s.source,
      {
        lden: s.lden ? { min: s.lden.min ?? null, max: s.lden.max ?? null } : null,
        lnight: s.lnight ? { min: s.lnight.min ?? null, max: s.lnight.max ?? null } : null,
      },
    ]),
  )

const PERIOD_PROPERTY = ['lday', 'levening', 'lnight', 'lden'] as const satisfies readonly (keyof SideLevels)[]

/** The EEA dataset of a `hotel_noise_facade` answer: all its bands come from one. */
export function facadeDataset(facade: unknown): string | null {
  const bands = facade && typeof facade === 'object' ? (facade as { bands?: unknown }).bands : null
  for (const band of Array.isArray(bands) ? bands : []) {
    const id = band && typeof band === 'object' ? text((band as { dataset?: unknown }).dataset) : null
    if (id) return id
  }
  return null
}

/**
 * The estimate of noise-estimate-v2 (`noiseEstimate`) from the answers of `hotel_noise_facade` and `osm_places_near_facade`
 * over `NOISY_CATEGORIES`, with the facade's bands and the loud places read, each place once (nearest first, under
 * the first of its categories), as the page reads them.
 */
export function estimateOf(facade: unknown, near: unknown) {
  const bands = facadeOf(facade)
  const answer = near && typeof near === 'object' ? (near as { places?: unknown }).places : null
  const seen = new Set<string>()
  const places = (Array.isArray(answer) ? answer.map((p) => nearPlace(p)).filter((p) => p !== null) : [])
    .sort(
      (a, b) => a.distance - b.distance || noisyRank(a.category) - noisyRank(b.category) || a.ref.localeCompare(b.ref),
    )
    .filter((p) => !seen.has(p.ref) && Boolean(seen.add(p.ref)))
  const estimate = noiseEstimate({
    ...bands,
    places: places.map((p) => ({
      category: p.category as NoisyCategory,
      name: p.name,
      distanceM: p.distance,
      lat: p.lat ?? 0,
      lon: p.lon ?? 0,
    })),
  })
  return { bands, places, estimate }
}

/**
 * The estimate of noise-estimate-v2 at the hotel's facade (`noiseEstimate`) from `hotel_noise_facade` and the loud
 * places of `osm_places_near_facade`: `noise.estimate.street.<period>` and `noise.estimate.yard.<period>` (the facade to the
 * street and the windows to the yard, the EEA layers and the places summed), `noise.estimate.facade.<period>` (the
 * EEA layers alone, street side) and `noise.estimate.venues.<period>` (the places alone), all `derived` from one
 * calculation with the datasets of EEA and EUBUCCO and the places of OSM as its inputs. Nothing without an EEA band
 * at the facade.
 */
export function estimateStore(
  hotel: ClaimHotel,
  facade: unknown,
  near: unknown,
  datasets: readonly Dataset[],
  buildingDataset: string | null,
): Store {
  const empty: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  const { bands, places, estimate } = estimateOf(facade, near)
  if (!estimate) return empty
  const byId = new Map(datasets.map((d) => [d.id, d]))
  const evidence: EvidenceRow[] = []
  const eea = facade && typeof facade === 'object' ? (facade as { bands?: unknown }).bands : null
  const eeaIds = new Set(
    (Array.isArray(eea) ? eea : []).flatMap((b) => {
      const id = b && typeof b === 'object' ? text((b as { dataset?: unknown }).dataset) : null
      return id ? [id] : []
    }),
  )
  for (const id of eeaIds) {
    const dataset = byId.get(id)
    if (dataset) evidence.push(datasetEvidence(dataset, EEA))
  }
  const building = estimate.zone?.kind === 'building' && buildingDataset ? byId.get(buildingDataset) : undefined
  if (building) evidence.push(datasetEvidence(building, EUBUCCO))
  // The places `noiseEstimate` counts: the loud kinds of `VENUE_LEVELS` within the radius. A level of the places cites
  // the places open in its period; the others cite the datasets, and their calculation lists the places.
  const counted = places.filter((p) => isVenue(p.category) && p.distance <= NOISY_RADIUS_M)
  const placeEvidence = counted.map(osmEvidence)
  const asInputs = (rows: readonly EvidenceRow[]) =>
    rows.map((e) => ({ evidence: evidenceKey(e), role: 'input' as const }))
  const datasetInputs = asInputs(evidence)
  const openIn = (period: NoisePeriod) =>
    asInputs(counted.filter((p) => isVenue(p.category) && period in VENUE_LEVELS[p.category]).map(osmEvidence))
  const key = `noise.estimate:${hotel.id}`
  const hotelKey = entityKey(hotelEntity(hotel))
  const claims: ClaimRow[] = []
  const claim = (
    property: string,
    value: { min: number | null; max: number | null } | number,
    kind: ConfidenceKind,
    inputs = datasetInputs,
  ) => {
    const range = typeof value === 'number' ? null : value
    if (range && range.min === null && range.max === null) return
    claims.push({
      entity: hotelKey,
      property,
      source_key: '',
      value_numeric: typeof value === 'number' ? Math.round(value * 10) / 10 : null,
      value_min: range?.min ?? null,
      value_max: range?.max ?? null,
      value_text: null,
      unit: 'dB',
      epistemic_status: 'derived',
      ...rated(kind, { name: NOISE_ESTIMATE_METHOD }),
      calculation: key,
      observed_at: null,
      limitations: [],
      evidence: inputs,
    })
  }
  const bounds = (range: LevelRange) => ({ min: estimateBound(range.min), max: estimateBound(range.max) })
  const withPlaces = estimate.counted.length > 0
  for (const side of ['street', 'yard'] as const)
    for (const period of PERIOD_PROPERTY) {
      const range = estimate[side][period]
      const day = period === 'lday' || period === 'levening'
      if (range)
        claim(
          `noise.estimate.${side}.${period}`,
          bounds(range),
          // The yard has no places in it: its levels are the EEA layers alone.
          side === 'yard'
            ? day
              ? 'facade_day'
              : 'facade_band'
            : withPlaces
              ? day
                ? 'noise_estimate_day'
                : 'noise_estimate'
              : day
                ? 'noise_estimate_no_places_day'
                : 'noise_estimate_no_places',
        )
    }
  for (const period of PERIOD_PROPERTY) {
    const range = estimate.eea.street[period]
    if (range)
      claim(
        `noise.estimate.facade.${period}`,
        bounds(range),
        period === 'lday' || period === 'levening' ? 'facade_day' : 'facade_band',
      )
  }
  for (const [period, of] of [
    ['lday', 'day'],
    ['levening', 'evening'],
    ['lnight', 'night'],
  ] as const) {
    const level = estimate.venues[period]
    if (level !== null) claim(`noise.estimate.venues.${period}`, level, 'venue_level', openIn(of))
  }
  const zone: Json =
    estimate.zone?.kind === 'building'
      ? { kind: 'building', building_id: estimate.zone.buildingId, buffer_m: estimate.zone.bufferM }
      : estimate.zone
        ? { kind: 'circle', radius_m: estimate.zone.radiusM }
        : null
  return {
    entities: [hotelEntity(hotel)],
    evidence: [...evidence, ...placeEvidence],
    calculations: [
      {
        key,
        method: ESTIMATE_METHOD,
        version: NOISE_ESTIMATE_METHOD,
        inputs: {
          hotel_id: hotel.id,
          zone,
          street_bands: bandsJson(bands.sources),
          yard_bands: bandsJson(bands.yard),
          places: estimate.counted.map((v) => ({
            category: v.category,
            name: v.name,
            distance_m: v.distanceM,
            levels_db: Object.fromEntries(
              Object.entries(v.levels).map(([period, level]) => [period, Math.round(level * 10) / 10]),
            ),
          })),
          ...(estimate.noDay.length > 0 && { no_day_layers: estimate.noDay }),
        },
        parameters: ESTIMATE_PARAMETERS as unknown as JsonObject,
        limitations: ESTIMATE_LIMITATIONS,
      },
    ],
    claims,
    relations: [],
    documents: [],
  }
}

/** The categories of src/lib/geo/categories.ts a guest needs near the hotel: a pharmacy, a shop, a doctor, a stop. */
export const NEARBY_CATEGORIES = [
  'pharmacy',
  'supermarket',
  'hospital',
  'bus_stop',
  'tram',
  'metro',
  'train_station',
  'beach',
  'park',
] as const
/** Within a walk of a quarter of an hour. */
export const NEARBY_RADIUS_M = 1000
/** The nearest of each category, as the geo tools ask `osm_places_near` (its default). */
export const NEARBY_PER_CATEGORY = 5

export const PLACES_METHOD =
  'osm_places_near: расстояние по прямой от точки отеля до формы объекта OSM; место Островка — его расстояние со страницы'
export const PLACES_VERSION = 'nearby-1'

/** A place of the hotel's Ostrovok page (`ota_hotel_places`) with the time of its row (`ota_hotel_pois.updated_at`). */
export interface OstrovokPlace {
  master_id: number
  region_id: number
  type: string
  subtype: string
  name: string | null
  name_en: string | null
  distance_m: number
  /** The straight line from the hotel's point to the place's point (`ota_hotel_places.straight_m`), m. */
  straight_m?: number | null
  lat: number
  lon: number
  updated_at: string | null
}

/** The Ostrovok kinds of the places of `NEARBY_CATEGORIES` (src/lib/geo/samePlace.ts groups them with OSM's). */
const NEARBY_KINDS = new Set(['Больница', 'Парк', 'Пляж', 'Станция'])

/**
 * The places of `NEARBY_CATEGORIES` around the hotel: the nearest `perCategory` of each in the cache of OSM within
 * `radiusM` (`osm_places_near`), each an entity with its OSM evidence and the edge hotel —near→ place, its distance a
 * `derived` claim `nearby.distance` of the hotel's calculation; and the hotel's Ostrovok places of these kinds within
 * `radiusM`, with the distance of the page (`reported`, the page as evidence). A place of both (src/lib/geo/samePlace.ts)
 * is the Ostrovok one: the OSM place folded into it gives no edge. A category with no place gives no claim: the cache
 * holds what was loaded, and OSM may lack a place.
 */
export function placesStore(
  hotel: ClaimHotel,
  answer: unknown,
  ostrovok: readonly OstrovokPlace[],
  { radiusM, perCategory }: { radiusM: number; perCategory: number },
): Store {
  const wanted = new Set<string>(NEARBY_CATEGORIES)
  const raw =
    answer && typeof answer === 'object' && Array.isArray((answer as { places?: unknown }).places)
      ? (answer as { places: unknown[] }).places
      : []
  const found = raw
    .map((p) => nearPlace(p, wanted))
    .filter((p): p is NonNullable<ReturnType<typeof nearPlace>> => p !== null)
  const covered = (answer as { covered?: unknown } | null)?.covered
  const own = ostrovok
    .filter((p) => p.distance_m <= radiusM && NEARBY_KINDS.has(placeKind(p.type, p.subtype)) && (p.name || p.name_en))
    .sort((a, b) => a.distance_m - b.distance_m || a.region_id - b.region_id)
  const osm = found.filter((p) => p.lat !== null && p.lon !== null)
  const merged = mergePlaces(
    own.map((p): OstrovokLike & { place: OstrovokPlace } => ({
      name: (p.name || p.name_en)!,
      ...(p.name_en && p.name_en !== p.name && { nameEn: p.name_en }),
      kind: placeKind(p.type, p.subtype),
      lat: p.lat,
      lon: p.lon,
      place: p,
    })),
    osm.map((p): OsmLike & { place: (typeof osm)[number] } => ({
      name: p.name,
      category: p.category,
      tags: p.tags,
      osmType: p.type,
      osmId: p.id,
      lat: p.lat!,
      lon: p.lon!,
      place: p,
    })),
  )
  const folded = new Set(merged.ostrovok.flatMap((m) => m.osm.map((o) => o.place.ref)))
  const places = found
    .filter((p) => !folded.has(p.ref))
    .sort((a, b) => a.distance - b.distance || a.ref.localeCompare(b.ref))
  const empty: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  if (places.length === 0 && merged.ostrovok.length === 0) return empty
  const hotelKey = entityKey(hotelEntity(hotel))
  const key = `nearby.places:${hotel.id}`
  const store: Store = { ...empty, entities: [hotelEntity(hotel)] }
  if (places.length > 0)
    store.calculations.push({
      key,
      method: PLACES_METHOD,
      version: PLACES_VERSION,
      inputs: {
        hotel_id: hotel.id,
        lat: hotel.lat,
        lon: hotel.lon,
        covered: Array.isArray(covered) ? covered.filter((c): c is string => typeof c === 'string') : [],
      },
      parameters: { radius_m: radiusM, per_category: perCategory, categories: [...NEARBY_CATEGORIES] },
      limitations: [
        'Кэш OSM ограничен тем, что загружено: места нет в кэше — не значит, что его нет на месте',
        'Расстояние по прямой до формы объекта, не путь пешком',
        `Не более ${perCategory} ближайших мест каждой категории`,
        'Место OSM, которое есть и на странице Островка, записано как место Островка',
      ],
    })
  const seen = new Set<string>()
  for (const place of places) {
    if (seen.has(place.ref)) continue
    seen.add(place.ref)
    const entity = osmEntity(place)
    const source = osmEvidence(place)
    const claim: ClaimRow = {
      entity: hotelKey,
      property: 'nearby.distance',
      source_key: place.ref,
      value_numeric: place.distance,
      value_min: null,
      value_max: null,
      value_text: null,
      unit: 'm',
      epistemic_status: 'derived',
      ...rated('osm_distance', { categories: place.categories.filter((c) => wanted.has(c)) }),
      calculation: key,
      observed_at: null,
      limitations: [],
      evidence: [{ evidence: evidenceKey(source), role: 'input' }],
    }
    store.entities.push(entity)
    store.evidence.push(source)
    store.claims.push(claim)
    store.relations.push({
      subject: hotelKey,
      predicate: 'near',
      object: entityKey(entity),
      claim: claimKey(claim),
      evidence: evidenceKey(source),
      confidence: claim.confidence,
    })
  }
  for (const { place: named, twins, osm: same } of merged.ostrovok) {
    const { place } = named
    const name = named.name
    const entity: EntityRow = {
      kind: 'ota_poi',
      ref: String(place.region_id),
      hotel_id: null,
      name,
      metadata: { lat: place.lat, lon: place.lon },
    }
    const source: EvidenceRow = {
      type: 'ota_page',
      title: `Страница отеля на Островке: «${name}»`,
      provider: OSTROVOK,
      external_id: `poi:${place.master_id}:${place.region_id}`,
      url: null,
      retrieved_at: time(place.updated_at),
      excerpt: `${name} — ${place.distance_m} м`,
      metadata: { master_id: place.master_id, region_id: place.region_id, type: place.type, subtype: place.subtype },
      dataset_id: null,
    }
    const claim: ClaimRow = {
      entity: hotelKey,
      property: 'nearby.distance',
      source_key: `ota_poi/${place.region_id}`,
      value_numeric: place.distance_m,
      value_min: null,
      value_max: null,
      value_text: null,
      unit: 'm',
      epistemic_status: 'reported',
      ...rated('ostrovok_place_distance', {
        kind: named.kind,
        // Ostrovok's distance is the claim's value; our straight line to the place's point is kept beside it, as the
        // two differ (a beach's point is its middle, and Ostrovok's distance is the shorter, up to 1 km).
        ...(typeof place.straight_m === 'number' && { straight_m: place.straight_m }),
        ...(twins.length > 0 && { aliases: twins.map((t) => t.name) }),
        // The categories of the OSM places that are it: a station of Ostrovok is a metro or a tram stop of OSM.
        ...(same.length > 0 && {
          osm: same.map((o) => o.place.ref),
          categories: NEARBY_CATEGORIES.filter((c) => same.some((o) => o.place.categories.includes(c))),
        }),
      }),
      calculation: null,
      observed_at: null,
      limitations: [
        'Расстояние со страницы Островка: как он его меряет, страница не говорит',
        'Прямая до точки места в method.straight_m может быть длиннее: точка пляжа — его середина',
      ],
      evidence: [{ evidence: evidenceKey(source), role: 'source' }],
    }
    store.entities.push(entity)
    store.evidence.push(source)
    store.claims.push(claim)
    store.relations.push({
      subject: hotelKey,
      predicate: 'near',
      object: entityKey(entity),
      claim: claimKey(claim),
      evidence: evidenceKey(source),
      confidence: claim.confidence,
    })
  }
  return store
}

/** The building of `hotel_geo` is the nearest within this many metres of the hotel's point, or none. */
export const BUILDING_RADIUS_M = 50
export const BUILDING_METHOD = `hotel_geo: ближайшее к точке отеля здание EUBUCCO в пределах ${BUILDING_RADIUS_M} м`
export const BUILDING_VERSION = 'hotel_geo-1'

/** A height or floors of EUBUCCO, to 0.1. */
const tenth = (value: unknown) => {
  const n = finite(value)
  return n !== null && n > 0 ? Math.round(n * 10) / 10 : null
}

/**
 * The building of EUBUCCO nearest to the hotel's point (`hotel_geo().building`, within `BUILDING_RADIUS_M`): the edge
 * hotel —nearest_building→ building, its distance a `derived` claim of the hotel `building.nearest.distance`, and the
 * height and the floors of that building as the hotel's claims `building.height` and `building.floors` (`reported`,
 * the dataset as evidence, the building's id as the source key, EUBUCCO's source and bounds in the method). Not
 * «the hotel's building»: the point of Ostrovok may stand on the next one. Nothing without a building or its dataset.
 */
export function buildingStore(hotel: ClaimHotel, building: unknown, datasets: readonly Dataset[]): Store {
  const empty: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  if (!building || typeof building !== 'object') return empty
  const row = building as Record<string, unknown>
  const id = text(row.id)
  const distance = finite(row.distance_m)
  const dataset = datasets.find((d) => d.id === text(row.dataset))
  if (!id || distance === null || distance < 0 || !dataset) return empty
  const hotelKey = entityKey(hotelEntity(hotel))
  const entity: EntityRow = { kind: 'building', ref: id, hotel_id: null, name: null }
  const source = datasetEvidence(dataset, EUBUCCO)
  const key = `building.nearest:${hotel.id}`
  const nearest = 'Ближайшее к точке отеля здание, не обязательно здание отеля'
  const distanceClaim: ClaimRow = {
    entity: hotelKey,
    property: 'building.nearest.distance',
    source_key: id,
    value_numeric: Math.round(distance * 10) / 10,
    value_min: null,
    value_max: null,
    value_text: null,
    unit: 'm',
    epistemic_status: 'derived',
    ...rated('building_distance', {}),
    calculation: key,
    observed_at: null,
    limitations: ['Расстояние по прямой до контура здания; 0 — точка внутри него'],
    evidence: [{ evidence: evidenceKey(source), role: 'input' }],
  }
  const store: Store = {
    ...empty,
    entities: [hotelEntity(hotel), entity],
    evidence: [source],
    calculations: [
      {
        key,
        method: BUILDING_METHOD,
        version: BUILDING_VERSION,
        inputs: { hotel_id: hotel.id, lat: hotel.lat, lon: hotel.lon },
        parameters: { max_distance_m: BUILDING_RADIUS_M },
        limitations: [nearest, 'Точка отеля — координаты Островка, не вход в здание'],
      },
    ],
    claims: [distanceClaim],
    relations: [
      {
        subject: hotelKey,
        predicate: 'nearest_building',
        object: entityKey(entity),
        claim: claimKey(distanceClaim),
        evidence: evidenceKey(source),
        confidence: distanceClaim.confidence,
      },
    ],
  }
  const measures = [
    ['height', tenth(row.height), 'm', row.height_source, row.height_confidence_lower, row.height_confidence_upper],
    [
      'floors',
      tenth(row.floors),
      'floors',
      row.floors_source,
      row.floors_confidence_lower,
      row.floors_confidence_upper,
    ],
  ] as const
  for (const [what, value, unit, rawSource, lower, upper] of measures) {
    if (value === null) continue
    const from = text(rawSource)
    store.claims.push({
      entity: hotelKey,
      property: `building.${what}`,
      source_key: id,
      value_numeric: value,
      value_min: null,
      value_max: null,
      value_text: null,
      unit,
      epistemic_status: 'reported',
      ...rated('eubucco_building', {
        source: from,
        lower: finite(lower),
        upper: finite(upper),
      }),
      calculation: null,
      observed_at: null,
      limitations: [
        nearest,
        ...(from === 'estimated'
          ? [`${what === 'height' ? 'Высота оценена' : 'Этажность оценена'} моделью EUBUCCO, не измерена`]
          : []),
      ],
      evidence: [{ evidence: evidenceKey(source), role: 'source' }],
    })
  }
  return store
}

/** Words about noise or quiet: «шумно», «тихий», «тишина», «громко», «звукоизоляция», «слышно», «noisy», «quiet». */
export const NOISE_MENTION =
  /(?<!\p{L})(?:бес|не)?(?:шум|тих|тиш|громк|звукоизол|слышн|слышимост|nois|quiet|loud)\p{L}*/iu

/** The parts of a review, in the order of its page, with the field they come from. */
const REVIEW_PARTS = [
  ['title', 'reviewTitle'],
  ['text', 'reviewText'],
  ['plus', 'reviewPlus'],
  ['minus', 'reviewMinus'],
] as const

/** A chunk of at most this many characters: a longer part is cut at its sentences. */
export const CHUNK_CHARS = 2000
/** The mention's excerpt is cut to this many characters around its word. */
export const MENTION_CHARS = 300

export const sentencesOf = (part: string) =>
  part
    .split(/(?<=[.!?…])\s+|\r?\n+/u)
    .map((s) => s.trim())
    .filter(Boolean)

/** The part as chunks of at most `CHUNK_CHARS`, cut between sentences (a longer sentence on its own, cut). */
export function chunksOf(part: string): string[] {
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentencesOf(part)) {
    for (let i = 0; i < sentence.length; i += CHUNK_CHARS) {
      const piece = sentence.slice(i, i + CHUNK_CHARS)
      if (current && current.length + 1 + piece.length > CHUNK_CHARS) {
        chunks.push(current)
        current = piece
      } else current = current ? `${current} ${piece}` : piece
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** The sentence of the mention, cut to `MENTION_CHARS` around the word. */
export function mentionExcerpt(sentence: string): string {
  if (sentence.length <= MENTION_CHARS) return sentence
  const at = sentence.search(NOISE_MENTION)
  const start = Math.max(0, Math.min(at - MENTION_CHARS / 2, sentence.length - MENTION_CHARS))
  return `${start > 0 ? '…' : ''}${sentence.slice(start, start + MENTION_CHARS).trim()}${start + MENTION_CHARS < sentence.length ? '…' : ''}`
}

/** A page's snapshot of the reviews (`ota_hotel_pages`): its hotel, its time and `reviews.list`. */
export interface ReviewPage {
  master_id: number
  updated_at: string
  list: readonly unknown[]
}

/**
 * The guests' reviews of the hotel's page: each a document of its parts (title, text, «понравилось», «не понравилось»)
 * as they are, chunked for the search, its evidence (Островок, the review's id, the snapshot's time), and a `reported`
 * claim `noise.review.mention` per sentence with a word of `NOISE_MENTION`, its value the sentence: what the guest
 * wrote, with no verdict. The author's name and room are not copied.
 */
export function reviewStore(hotel: ClaimHotel, page: ReviewPage): Store {
  const hotelKey = entityKey(hotelEntity(hotel))
  const store: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  for (const value of page.list) {
    if (!value || typeof value !== 'object') continue
    const review = value as Record<string, unknown>
    const id = finite(review.id)
    if (id === null) continue
    const parts = REVIEW_PARTS.flatMap(([part, field]) => {
      const body = text(review[field])
      return body ? [{ part, body: body.replace(/\r\n?/g, '\n') }] : []
    })
    if (parts.length === 0) continue
    const date = time(review.reviewDate)
    const whole = parts.map((p) => p.body).join('\n\n')
    const source: EvidenceRow = {
      type: 'review',
      title: `Отзыв гостя${date ? ` от ${date.slice(0, 10)}` : ''}`,
      provider: OSTROVOK,
      external_id: String(id),
      url: null,
      retrieved_at: time(page.updated_at),
      excerpt: whole.length > 500 ? `${whole.slice(0, 500).trim()}…` : whole,
      metadata: {
        master_id: page.master_id,
        review_date: date,
        rating: finite(typeof review.rating === 'string' ? Number(review.rating) : review.rating),
        review_type: text(review.reviewType),
        is_translated_by_ai: review.isTranslatedByAI === true,
      },
      dataset_id: null,
    }
    const key = evidenceKey(source)
    store.evidence.push(source)
    let ord = 0
    const chunks: ChunkRow[] = parts.flatMap(({ part, body }) =>
      chunksOf(body).map((chunk) => ({ ord: ord++, text: chunk, metadata: { part } })),
    )
    store.documents.push({
      evidence: key,
      kind: 'review',
      hotel_id: hotel.id,
      entity: hotelKey,
      language: /\p{Script=Cyrillic}/u.test(whole) ? 'ru' : null,
      text: whole,
      metadata: { master_id: page.master_id, review_id: id, parts: parts.map((p) => p.part) },
      chunks,
    })
    for (const { part, body } of parts)
      sentencesOf(body).forEach((sentence, index) => {
        if (!NOISE_MENTION.test(sentence)) return
        store.claims.push({
          entity: hotelKey,
          property: 'noise.review.mention',
          source_key: `${id}:${part}:${index}`,
          value_numeric: null,
          value_min: null,
          value_max: null,
          value_text: mentionExcerpt(sentence),
          unit: null,
          epistemic_status: 'reported',
          ...rated('review_mention', { part, pattern: NOISE_MENTION.source }),
          calculation: null,
          observed_at: date,
          limitations: [
            'Слова гостя из отзыва, не измерение',
            'Упоминание шума или тишины, без вывода «тихо» или «шумно»',
          ],
          evidence: [{ evidence: key, role: 'source' }],
        })
      })
  }
  if (store.evidence.length > 0) store.entities.push(hotelEntity(hotel))
  return store
}

/** The stores of all the hotels in one, each entity and evidence once (the last one given wins). */
export function mergeStores(stores: readonly Store[]): Store {
  const once = <T>(rows: T[], key: (row: T) => string) => [...new Map(rows.map((row) => [key(row), row])).values()]
  const all = <K extends keyof Store>(k: K): Store[K] => stores.flatMap((s) => s[k] as unknown[]) as Store[K]
  return {
    entities: once(all('entities'), entityKey),
    evidence: once(all('evidence'), evidenceKey),
    calculations: once(all('calculations'), (row) => row.key),
    claims: once(all('claims'), claimKey),
    relations: once(all('relations'), (row) => `${row.subject}|${row.predicate}|${row.object}`),
    documents: once(all('documents'), (row) => row.evidence),
  }
}

/** What the hotel's Ostrovok page says of it, the parts read here (`ota_hotel_pages.hotel->facts`, the time of the row). */
export interface FactsPage {
  master_id: number
  updated_at: string
  facts: unknown
}

/** The facts of the page that become claims: the property, its unit and the key in `facts`. Zero is «unknown». */
const FACTS = [
  { property: 'hotel.year_built', key: 'yearBuilt', unit: 'year', label: 'год постройки' },
  { property: 'hotel.year_renovated', key: 'yearRenovated', unit: 'year', label: 'год ремонта' },
  { property: 'hotel.rooms_count', key: 'roomsNumber', unit: null, label: 'число номеров' },
  // Not the building's floors: the floors the hotel's rooms take (the building's are EUBUCCO's, `building.*`).
  { property: 'hotel.room_floors', key: 'floorsNumber', unit: null, label: 'этажи, которые занимают номера' },
] as const

/**
 * The facts of the hotel's page — the year built and renovated, the number of rooms, the floors its rooms take — each a
 * `reported` claim of the hotel with the page as evidence. A fact the page leaves at zero or lacks gives no claim: the
 * page's zero is «unknown», not a value.
 */
export function factsStore(hotel: ClaimHotel, page: FactsPage): Store {
  const store: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  const facts = page.facts && typeof page.facts === 'object' ? (page.facts as Record<string, unknown>) : {}
  const hotelKey = entityKey(hotelEntity(hotel))
  const source: EvidenceRow = {
    type: 'ota_page',
    title: `Страница отеля на Островке: «${hotel.name ?? hotel.id}»`,
    provider: OSTROVOK,
    external_id: `facts:${page.master_id}`,
    url: null,
    retrieved_at: time(page.updated_at),
    excerpt: null,
    metadata: { master_id: page.master_id },
    dataset_id: null,
  }
  for (const { property, key, unit, label } of FACTS) {
    const value = finite(facts[key])
    if (value === null || value <= 0) continue
    store.claims.push({
      entity: hotelKey,
      property,
      source_key: key,
      value_numeric: value,
      value_min: null,
      value_max: null,
      value_text: null,
      unit,
      epistemic_status: 'reported',
      ...rated('ostrovok_fact', { key }),
      calculation: null,
      observed_at: null,
      limitations: [`Данные страницы Островка (${label}): их сообщает отель, Островок не проверяет`],
      evidence: [{ evidence: evidenceKey(source), role: 'source' }],
    })
  }
  if (store.claims.length > 0) {
    store.entities.push(hotelEntity(hotel))
    store.evidence.push(source)
  }
  return store
}

/**
 * The views the names of the hotel's room types tell of (src/lib/featureRows.ts `viewRows`): the room is an entity,
 * `room.view` its claim `reported` with the name as the evidence's excerpt. A name without a view gives nothing: not
 * «без вида». Other variants of the same room may be named otherwise, so the claim is about the named variant.
 */
export function roomViewStore(hotel: ClaimHotel, groups: readonly RoomGroup[], updatedAt: string | null): Store {
  const store: Store = { entities: [], evidence: [], calculations: [], claims: [], relations: [], documents: [] }
  const seen = new Set<string>()
  for (const row of viewRows(Number(hotel.id.replace('ota-', '')), groups)) {
    const group = groups.find((g) => g.rg_hash === row.rg_hash)
    const name = text(group?.name_struct?.main_name)
    if (!name) continue
    const room: EntityRow = {
      kind: 'room',
      ref: `${hotel.id}/${row.rg_hash}`,
      hotel_id: hotel.id,
      name,
    }
    const source: EvidenceRow = {
      type: 'ota_page',
      title: `Название номера на Островке: «${name}»`,
      provider: OSTROVOK,
      external_id: `room:${row.master_id}:${row.rg_hash}`,
      url: null,
      retrieved_at: time(updatedAt),
      excerpt: name,
      metadata: { master_id: row.master_id, rg_hash: row.rg_hash },
      dataset_id: null,
    }
    if (!seen.has(entityKey(room))) {
      seen.add(entityKey(room))
      store.entities.push(room)
      store.evidence.push(source)
    }
    store.claims.push({
      entity: entityKey(room),
      property: 'room.view',
      source_key: row.view,
      value_numeric: null,
      value_min: null,
      value_max: null,
      value_text: row.view,
      unit: null,
      epistemic_status: 'reported',
      ...rated('room_name_view', { name }),
      calculation: null,
      observed_at: null,
      limitations: ['Вид взят из названия типа номера; в другом варианте того же номера его в названии может не быть'],
      evidence: [{ evidence: evidenceKey(source), role: 'source' }],
    })
  }
  if (store.entities.length > 0) store.entities.unshift(hotelEntity(hotel))
  return store
}

/** JSON with its keys sorted: jsonb comes back in its own order. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )

/**
 * Whether the stored row holds the values of `next` (only the columns of `next`): numbers as numbers, the times as
 * instants (the database writes them its own way), JSON and arrays whatever their keys' order.
 */
export function sameRow(stored: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return Object.entries(next).every(([column, value]) => {
    const old = stored[column]
    if (old === value) return true
    if (old === undefined || old === null || value === null) return false
    if (typeof old === 'number' && typeof value === 'number') return Math.abs(old - value) < 1e-9
    if (typeof old === 'string' && typeof value === 'string' && /(_at|^valid_\w+)$/.test(column))
      return Date.parse(old) === Date.parse(value)
    return typeof old === 'object' && typeof value === 'object' && canonical(old) === canonical(value)
  })
}
