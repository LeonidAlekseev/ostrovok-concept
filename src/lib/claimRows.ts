import { NOISY_CATEGORIES, dayEstimate } from './noise'
import type { NoiseBand } from './features'

/**
 * The rows of the store of claims (supabase/migrations/20261027220000_claims_evidence_store.sql) that
 * `npm run db:features` writes for the real hotels: pure, so the tests check what goes to the database. The rows point
 * at each other by their natural keys (`entityKey`, `evidenceKey`, `claimKey`, the calculation's `key`); the script
 * turns the keys into the ids of the database. Only what the sources give: EEA's bands at the hotel's point, the day
 * estimate from them, the loud OSM places within `NOISY_RADIUS_M`, the guests' reviews and their words about noise and
 * quiet. A hotel outside the EEA contours has no band (not «тихо»), a review without such words no claim (not «тихо»
 * either); no confidence is given, none has a basis.
 */

export type EpistemicStatus = 'observed' | 'reported' | 'derived' | 'inferred'
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

export interface EntityRow {
  kind: 'hotel' | 'osm_place'
  ref: string
  hotel_id: string | null
  name: string | null
}

export interface EvidenceRow {
  type: 'dataset' | 'osm' | 'review'
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
  confidence: null
  method: JsonObject
  /** The `key` of its calculation, for a derived claim. */
  calculation: string | null
  observed_at: string | null
  limitations: string[]
  evidence: ClaimEvidenceRef[]
}

export interface RelationRow {
  subject: string
  predicate: 'near'
  object: string
  /** `claimKey` of the claim of the edge's value (the distance). */
  claim: string | null
  evidence: string | null
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
      confidence: null,
      method: { layer: band.source, indicator: band.indicator, category: band.category },
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
      confidence: null,
      method: { layer, from: ['Lden', 'Lnight'] },
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

/** A place of an `osm_places_near` answer, the parts read here. */
const nearPlace = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const type = row.osm_type === 'node' || row.osm_type === 'way' || row.osm_type === 'relation' ? row.osm_type : null
  const id = finite(row.osm_id)
  const category = text(row.category)
  const distance = finite(row.distance_m)
  if (!type || id === null || !Number.isInteger(id) || !category || !NOISY.has(category) || distance === null)
    return null
  return {
    ref: `${type}/${id}`,
    category,
    categories: Array.isArray(row.categories) ? row.categories.filter((c): c is string => typeof c === 'string') : [],
    name: text(row.name),
    distance,
    fetchedAt: time(row.fetched_at),
    attribution: text(row.attribution),
    origin: text(row.origin),
  }
}

export const NEAR_METHOD = 'osm_places_near: расстояние по прямой от точки отеля до формы объекта OSM'
export const NEAR_VERSION = 'osm_places_near-1'

/**
 * The loud places of OSM around the hotel (`osm_places_near` over `NOISY_CATEGORIES`): each place an entity with its
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
      ? ((answer as { places: unknown[] }).places.map(nearPlace).filter(Boolean) as NonNullable<
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
      'Расстояние по прямой до формы объекта, не путь пешком',
      `Не более ${perCategory} мест каждой категории`,
    ],
  })
  const byCategory = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (const place of places) {
    byCategory.set(place.category, (byCategory.get(place.category) ?? new Set()).add(place.ref))
    if (seen.has(place.ref)) continue
    seen.add(place.ref)
    const entity: EntityRow = { kind: 'osm_place', ref: place.ref, hotel_id: null, name: place.name }
    const source: EvidenceRow = {
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
    }
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
      confidence: null,
      method: { categories: place.categories.filter((c) => NOISY.has(c)) },
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
      confidence: null,
      method: { category, radius_m: radiusM },
      calculation: key,
      observed_at: null,
      limitations: full ? ['Ответ ограничен: мест может быть больше'] : [],
      evidence: [...refs].map((ref) => ({ evidence: `${OSM}:${ref}`, role: 'input' as const })),
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

const sentencesOf = (part: string) =>
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
          confidence: null,
          method: { part, pattern: NOISE_MENTION.source },
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
