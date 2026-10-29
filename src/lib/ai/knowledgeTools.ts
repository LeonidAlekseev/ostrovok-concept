import 'server-only'
import { NOISE_MENTION, NEARBY_CATEGORIES, mentionExcerpt, sentencesOf } from '../claimRows'
import { confidenceFor } from '../confidence'
import { isRealHotelId } from '../db/anon'
import {
  loadEvidence,
  loadHotelClaims,
  loadHotelierClaims,
  searchHotelReviews,
  type ClaimEvidence,
  type HotelChunk,
  type HotelierNoise,
  type HotelClaim,
} from '../db/claims'
import type { LevelRow, NearRow } from '../db/knowledge'
import { loadClaimsByIds } from '../db/knowledge'
import { countRu, formatDecimal, formatMeters } from '../format'
import { CATEGORY } from '../geo/categories'
import { distanceLabel } from '../hotelDetails'
import { NOISE_ESTIMATE_METHOD, dayLabel } from '../noise'
import { queryVectorOrNull } from './semantic'
import {
  MAX_CALCULATIONS,
  MAX_CLAIMS,
  MAX_EVIDENCE,
  MAX_GROUPS,
  errorResult,
  fitResult,
  toolResultSchema,
  type ToolCalculation,
  type ToolClaim,
  type ToolEvidence,
  type ToolGroup,
  type ToolResult,
} from '../toolResult'
import { calculationOf, evidenceOf } from './noiseTool'

/**
 * Эвал's tools of the choice of hotels (docs/tools.md), each a run of the contract with its sources:
 * - «Отели по характеристикам» — the hotels of the plan's cities by their claims: the night and the day at the
 *   facade to the street (noise-estimate-v2: EEA's bands and the loud places nearby), the building's height; a hotel without the claim is «нет данных», never «подходит» or not;
 * - «Места рядом» (the graph of the store) — the nearest place of a category by the edges `near` of each hotel, its
 *   distance a claim with its evidence of OSM or Островок; no edge is «в данных нет», never «рядом нет»;
 * - «Отзывы» (the search of the reviews) — the guests' words on a topic for the chosen hotels, quoted.
 * The choice (`featureVerdicts`, `nearVerdicts`) reads the indexes of src/lib/db/knowledge.ts for every hotel; the run
 * (`featuresResult`, `nearResult`, `reviewsResult`) shows the chosen ones with their claims whole. Pure but for the
 * reads of `run*`: the tests check them on the store's rows. Nothing is said of a hotel the store has no data of, no
 * level is lowered for windows or walls.
 */

export const FEATURES_TOOL = 'hotels_by_features'
export const FEATURES_TOOL_TITLE = 'Отели по характеристикам'
export const NEARBY_TOOL = 'nearby_places'
export const NEARBY_TOOL_TITLE = 'Места рядом'
export const REVIEWS_TOOL = 'hotel_reviews'
export const REVIEWS_TOOL_TITLE = 'Отзывы'

/** A hotel the tools choose among: its id and name. */
export interface Candidate {
  id: string
  name: string
}

export type Verdict = 'match' | 'miss' | 'nodata'

/** What a tool's choice says of a hotel: its verdict and the value it went by, lower better. */
export interface HotelVerdict {
  verdict: Verdict
  /** The night band's upper bound, the distance in metres: the order among the hotels that match. */
  score: number
}

/** The thresholds of «Отели по характеристикам»; at least one. */
export interface FeatureCriteria {
  /** The night at the facade to the street must end below this, dB: «тихо ночью» is 50. */
  nightBelowDb?: number
  /** The day at the facade to the street must end below this, dB. */
  dayBelowDb?: number
  heightMinM?: number
  heightMaxM?: number
}

export type NearCategory = (typeof NEARBY_CATEGORIES)[number]
export const NEAR_CATEGORIES: readonly NearCategory[] = NEARBY_CATEGORIES

/** The store has the places within this of each hotel: a larger radius asks what it does not know. */
export const NEAR_MAX_RADIUS_M = 1000
/** «Рядом» of the rules: five minutes or so on foot. */
export const NEAR_DEFAULT_RADIUS_M = 500
/** «Тихо ночью» of the rules: the night at the facade to the street ends below 50 dB. */
export const QUIET_NIGHT_DB = 50

export const REVIEW_TOPICS = ['noise', 'cleanliness', 'staff', 'breakfast', 'food', 'comfort', 'location'] as const
export type ReviewTopic = (typeof REVIEW_TOPICS)[number]

export const REVIEW_TOPIC_LABEL: Record<ReviewTopic, string> = {
  noise: 'шум и тишина',
  cleanliness: 'чистота',
  staff: 'персонал',
  breakfast: 'завтрак',
  food: 'кухня и еда',
  comfort: 'кровать и сон',
  location: 'расположение',
}

/**
 * The words of each topic in websearch syntax for the full-text part of the search: the Russian stemming does not take
 * «шумно» to «шум», so the forms are asked one by one (`NOISE_MENTION` of src/lib/claimRows.ts is the same list as a
 * pattern). The meaning part embeds the topic's label (`REVIEW_TOPIC_LABEL`).
 */
export const REVIEW_QUERY: Record<ReviewTopic, string> = {
  noise: ['шум', 'шумно', 'шумный', 'тихо', 'тихий', 'тишина', 'громко', 'слышно', 'звукоизоляция'].join(' or '),
  cleanliness: ['чисто', 'чистота', 'чистый', 'грязно', 'грязь', 'уборка', 'убирали'].join(' or '),
  staff: ['персонал', 'сотрудники', 'администратор', 'ресепшн', 'ресепшен', 'вежливый', 'приветливый'].join(' or '),
  breakfast: ['завтрак', 'завтраки', 'завтраком'].join(' or '),
  food: ['кухня', 'кухней', 'еда', 'ужин', 'ресторан', 'вкусно', 'вкусный', 'кормят', 'блюда'].join(' or '),
  comfort: ['кровать', 'матрас', 'подушки', 'выспаться', 'спать', 'сон'].join(' or '),
  location: ['расположение', 'район', 'центр', 'метро', 'рядом', 'близко', 'пешком'].join(' or '),
}

/** The words of a topic in a sentence: a chunk without them is not quoted, its excerpt is cut around the first. */
const TOPIC_MENTION: Record<ReviewTopic, RegExp> = {
  noise: NOISE_MENTION,
  cleanliness: /(?<!\p{L})(?:чист|грязн|грязь|убор|убира)\p{L}*/iu,
  staff: /(?<!\p{L})(?:персонал|сотрудник|администратор|ресепш|вежлив|приветлив)\p{L}*/iu,
  breakfast: /(?<!\p{L})завтрак\p{L}*/iu,
  food: /(?<!\p{L})(?:кухн|еда|еды|еду|едой|ужин|ресторан|вкусн|кормят|кормили|блюд)\p{L}*/iu,
  comfort: /(?<!\p{L})(?:кроват|матрас|подушк|выспа|спать|сон)\p{L}*/iu,
  location: /(?<!\p{L})(?:располож|район|центр|метро|рядом|близко|пешком)\p{L}*/iu,
}

/** The hotels a block shows by name, and those named in the line «нет данных». */
export const SHOWN_HOTELS = 6
const NAMED_NODATA = 5
/** Fragments of reviews per hotel. */
export const REVIEWS_PER_HOTEL = 2

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)
const hotels = (n: number) => countRu(n, ['отель', 'отеля', 'отелей'])
/** «из 1 отеля», «из 3 отелей», «из 21 отеля». */
const ofHotels = (n: number) => countRu(n, ['отеля', 'отелей', 'отелей'])

// ——— The choice ———

/** The estimate of noise-estimate-v2 at the facade to the street: the EEA layers and the loud places summed. */
const NIGHT = /^noise\.estimate\.street\.lnight$/
const DAY = /^noise\.estimate\.street\.lday$/
const HEIGHT = 'building.height'

/** The upper bound of a band: an open one is the loudest. */
const upper = (row: { max: number | null }) => row.max ?? Infinity

/** What a hotelier's words on the noise say: «тихо», «шумно», or nothing a rule can read. */
export type NoiseWords = 'quiet' | 'loud' | 'unknown'

const NEGATED = /(?<!\p{L})не\s+(?:\p{L}+\s+)?(?:бес)?(?:тих|шум|громк)/iu
const QUIET = /тих|бесшум/iu
const LOUD = /(?<!бес)шумн|громк/iu

/** The rules, no model: a negation («не тихо»), both words or neither is `unknown`. */
export function noiseWords(text: string): NoiseWords {
  if (NEGATED.test(text)) return 'unknown'
  const quiet = QUIET.test(text)
  const loud = LOUD.test(text)
  return quiet === loud ? 'unknown' : quiet ? 'quiet' : 'loud'
}

/** What the levels say of a hotel: the night and the day at the facade to the street, the height. */
export interface HotelLevels {
  night?: number
  day?: number
  height?: number
  /** The hotelier calls the hotel quiet at night in every current answer: those answers. */
  hotelierQuiet?: HotelierNoise[]
}

/** The levels of each hotel of the index; the hotelier's answers on the noise are kept for the hotels they all call quiet. */
export function levelsOf(rows: readonly LevelRow[], hotelier: readonly HotelierNoise[] = []): Map<string, HotelLevels> {
  const levels = new Map<string, HotelLevels>()
  const answers = new Map<string, HotelierNoise[]>()
  for (const answer of hotelier) answers.set(answer.hotelId, [...(answers.get(answer.hotelId) ?? []), answer])
  for (const [hotelId, own] of answers)
    if (own.every((a) => noiseWords(a.text) === 'quiet')) levels.set(hotelId, { hotelierQuiet: own })
  for (const row of rows) {
    const known = levels.get(row.hotelId) ?? {}
    if (NIGHT.test(row.property)) known.night = Math.max(known.night ?? -Infinity, upper(row))
    else if (DAY.test(row.property)) known.day = Math.max(known.day ?? -Infinity, upper(row))
    else if (row.property === HEIGHT && row.value !== null) known.height = row.value
    levels.set(row.hotelId, known)
  }
  return levels
}

/** The hotelier's «тихо» closes a missing night level for a threshold at or above `QUIET_NIGHT_DB`, the number «тихо» means. */
export const quietByHotelier = (levels: HotelLevels | undefined, criteria: FeatureCriteria) =>
  levels?.night === undefined && !!levels?.hotelierQuiet && (criteria.nightBelowDb ?? -Infinity) >= QUIET_NIGHT_DB

/** The verdict of each criterion of a hotel: a value the threshold passes, one it does not, or none. */
export function criteriaVerdicts(levels: HotelLevels | undefined, criteria: FeatureCriteria) {
  const of = (value: number | undefined, passes: (v: number) => boolean): Verdict =>
    value === undefined ? 'nodata' : passes(value) ? 'match' : 'miss'
  return {
    ...(criteria.nightBelowDb !== undefined && {
      night: quietByHotelier(levels, criteria) ? 'match' : of(levels?.night, (v) => v < criteria.nightBelowDb!),
    }),
    ...(criteria.dayBelowDb !== undefined && { day: of(levels?.day, (v) => v < criteria.dayBelowDb!) }),
    ...((criteria.heightMinM !== undefined || criteria.heightMaxM !== undefined) && {
      height: of(
        levels?.height,
        (v) => v >= (criteria.heightMinM ?? -Infinity) && v <= (criteria.heightMaxM ?? Infinity),
      ),
    }),
  } as Partial<Record<'night' | 'day' | 'height', Verdict>>
}

/** A miss of any criterion is a miss; else a criterion without data is «нет данных». */
const joined = (verdicts: readonly Verdict[]): Verdict =>
  verdicts.includes('miss') ? 'miss' : verdicts.includes('nodata') ? 'nodata' : 'match'

/** The verdict of each hotel by the thresholds; the quieter night, then the quieter day, first. */
export function featureVerdicts(
  index: readonly LevelRow[],
  hotelIds: readonly string[],
  criteria: FeatureCriteria,
  hotelier: readonly HotelierNoise[] = [],
): Map<string, HotelVerdict> {
  const levels = levelsOf(index, hotelier)
  return new Map(
    hotelIds.map((id) => {
      const own = levels.get(id)
      const verdict = joined(Object.values(criteriaVerdicts(own, criteria)))
      return [id, { verdict, score: (own?.night ?? 100) * 1000 + (own?.day ?? 100) }]
    }),
  )
}

/** The nearest place of the index of each hotel. */
export function nearestOf(index: readonly NearRow[]): Map<string, NearRow> {
  const nearest = new Map<string, NearRow>()
  for (const row of index) {
    const known = nearest.get(row.hotelId)
    if (!known || row.distanceM < known.distanceM) nearest.set(row.hotelId, row)
  }
  return nearest
}

/** The verdict of each hotel: its nearest place within the radius, farther, or no edge at all («в данных нет»). */
export function nearVerdicts(
  index: readonly NearRow[],
  hotelIds: readonly string[],
  radiusM: number,
): Map<string, HotelVerdict> {
  const nearest = nearestOf(index)
  return new Map<string, HotelVerdict>(
    hotelIds.map((id) => {
      const place = nearest.get(id)
      if (!place) return [id, { verdict: 'nodata' as const, score: Infinity }]
      return [
        id,
        { verdict: place.distanceM <= radiusM ? ('match' as const) : ('miss' as const), score: place.distanceM },
      ]
    }),
  )
}

/** How many hotels of each verdict. */
export function verdictCounts(verdicts: ReadonlyMap<string, HotelVerdict>) {
  const counts = { match: 0, miss: 0, nodata: 0 }
  for (const { verdict } of verdicts.values()) counts[verdict]++
  return counts
}

/**
 * The hotels of the answer: those every choice says match, then — when none does — those no choice says miss; in the
 * order of the tools' values, then the candidates' own order (the search by meaning, the rating). Empty when none.
 */
export function chooseHotels(
  candidates: readonly Candidate[],
  choices: readonly ReadonlyMap<string, HotelVerdict>[],
  limit = SHOWN_HOTELS,
): { ids: string[]; complete: boolean } {
  const order = new Map(candidates.map((c, i) => [c.id, i]))
  const rank = (ids: string[]) =>
    ids.sort((a, b) => {
      for (const choice of choices) {
        const d = (choice.get(a)?.score ?? Infinity) - (choice.get(b)?.score ?? Infinity)
        if (d !== 0 && !Number.isNaN(d)) return d
      }
      return order.get(a)! - order.get(b)!
    })
  const verdicts = (id: string) => choices.map((c) => c.get(id)?.verdict ?? 'nodata')
  const all = candidates.map((c) => c.id)
  const complete = rank(all.filter((id) => verdicts(id).every((v) => v === 'match')))
  if (complete.length > 0) return { ids: complete.slice(0, limit), complete: true }
  const open = rank(all.filter((id) => !verdicts(id).includes('miss') && verdicts(id).includes('match')))
  return { ids: open.slice(0, limit), complete: false }
}

// ——— The runs ———

/** The criteria in Russian: «ночью тише 50 дБ · днём тише 55 дБ · здание от 20 м». */
export function criteriaLabel(criteria: FeatureCriteria): string {
  const height =
    criteria.heightMinM !== undefined && criteria.heightMaxM !== undefined
      ? `здание ${criteria.heightMinM}–${criteria.heightMaxM} м`
      : criteria.heightMinM !== undefined
        ? `здание от ${criteria.heightMinM} м`
        : criteria.heightMaxM !== undefined
          ? `здание до ${criteria.heightMaxM} м`
          : null
  return [
    criteria.nightBelowDb !== undefined && `ночью тише ${criteria.nightBelowDb} дБ`,
    criteria.dayBelowDb !== undefined && `днём тише ${criteria.dayBelowDb} дБ`,
    height,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** «Hotel A, Hotel B и ещё 3». */
function namedList(names: readonly string[]): string {
  const shown = names.slice(0, NAMED_NODATA).join(', ')
  return names.length > NAMED_NODATA ? `${shown} и ещё ${names.length - NAMED_NODATA}` : shown
}

/** The evidence, claims and calculations of a run, gathered hotel by hotel, each source once. */
class Gathered {
  evidence = new Map<string, ToolEvidence>()
  claims: ToolClaim[] = []
  calculations = new Map<string, ToolCalculation>()
  groups: ToolGroup[] = []

  /** A claim of the store with its sources and calculation, as `label` — `value`; its id, or none when it did not fit. */
  claim(claim: HotelClaim, hotelId: string, label: string, value: string, sources = claim.evidence): string | null {
    if (this.claims.length >= MAX_CLAIMS || this.claims.some((c) => c.id === claim.id)) return null
    const ids: string[] = []
    for (const e of sources) {
      if (!this.evidence.has(e.id) && this.evidence.size >= MAX_EVIDENCE) continue
      if (!this.evidence.has(e.id)) this.evidence.set(e.id, evidenceOf(e, hotelId, claim.id))
      else if (this.evidence.get(e.id)!.claim_id !== claim.id)
        this.evidence.set(e.id, { ...this.evidence.get(e.id)!, entity_id: null, claim_id: null })
      ids.push(e.id)
    }
    const calculation = claim.calculation
    if (calculation && !this.calculations.has(calculation.id) && this.calculations.size < MAX_CALCULATIONS)
      this.calculations.set(calculation.id, calculationOf(calculation))
    this.claims.push({
      id: claim.id,
      label: label.slice(0, 300),
      value: value.slice(0, 500),
      status: claim.status,
      confidence: claim.confidence,
      ...(claim.demo && { demo: true }),
      evidence_ids: [...new Set(ids)],
      calculation_id: calculation && this.calculations.has(calculation.id) ? calculation.id : null,
    })
    return claim.id
  }

  group(id: string, title: string, note: string | null, claimIds: readonly (string | null)[]) {
    if (this.groups.length >= MAX_GROUPS) return
    this.groups.push({
      id,
      title: title.slice(0, 300) || id,
      note: note && note.slice(0, 500),
      claim_ids: claimIds.filter((c): c is string => c !== null),
    })
  }

  result(fields: Pick<ToolResult, 'summary' | 'data' | 'method' | 'limitations'>): ToolResult {
    return fitResult(
      toolResultSchema.parse({
        status: 'success',
        ...fields,
        summary: capital(fields.summary).slice(0, 1000),
        limitations: fields.limitations.slice(0, 20),
        evidence: [...this.evidence.values()],
        claims: this.claims,
        calculations: [...this.calculations.values()],
        error: null,
        groups: this.groups,
      } satisfies ToolResult),
    )
  }
}

/** The group of the hotels without data: their names in its note, no claims. */
function noDataGroup(gathered: Gathered, id: string, names: readonly string[], what: string) {
  if (names.length === 0) return
  gathered.group(id, `Нет данных: ${hotels(names.length)}`, `${capital(what)} в хранилище нет: ${namedList(names)}`, [])
}

const FEATURE_LIMITATIONS = [
  'Нет данных — не значит «тихо» или «шумно»: такой отель не считается ни подходящим, ни неподходящим',
  'Уровни EEA — модельная карта снаружи здания полосами по 5 дБ; звукоизоляция окон и номеров не оценивается',
  'Слова отельера — его слова, сервис их не проверял (уверенность 75 %); демо-сведения помечены «демо»',
  'Высота — у ближайшего к точке отеля здания EUBUCCO, не обязательно здания отеля',
]

export interface FeaturesInput {
  criteria: FeatureCriteria
  candidates: readonly Candidate[]
  /** The hotels of the answer: the block shows them. */
  chosen: readonly string[]
  /** The cities the hotels are of, for the summary: «Валенсии». */
  where?: string
  /** The hotels' current answers on the noise: they close a night level the EEA lacks. */
  hotelier?: readonly HotelierNoise[]
  /** The chosen hotels some of whose reads got no answer: what the block shows of them may be incomplete. */
  incomplete?: readonly string[]
}

const HOTELIER_NOISE = 'hotelier.room.noise'

/** The loudest of the claims of a kind: the band that decides. */
function loudest(claims: readonly HotelClaim[], pattern: RegExp): HotelClaim | undefined {
  return claims
    .filter((c) => pattern.test(c.property) && c.value.kind === 'range')
    .sort((a, b) => {
      const ua = a.value.kind === 'range' ? (a.value.max ?? Infinity) : 0
      const ub = b.value.kind === 'range' ? (b.value.max ?? Infinity) : 0
      return ub - ua
    })[0]
}

const VERDICT_NOTE: Record<Verdict, string> = { match: 'подходит', miss: 'не подходит', nodata: 'нет данных' }

/**
 * «Отели по характеристикам» from the index of levels and the chosen hotels' claims (`null`: not read): the counts
 * of the choice among the candidates, and for each chosen hotel the claims it was chosen by — the night and the day
 * at the facade to the street, the building's height — with the verdict of each criterion.
 */
export function featuresResult(
  { criteria, candidates, chosen, where, hotelier, incomplete }: FeaturesInput,
  index: readonly LevelRow[] | null,
  claims: ReadonlyMap<string, readonly HotelClaim[] | null>,
): ToolResult {
  if (index === null)
    return errorResult('store_unavailable', 'Не получилось прочитать характеристики отелей: хранилище недоступно', {
      limitations: FEATURE_LIMITATIONS,
    })
  const ids = candidates.map((c) => c.id)
  const verdicts = featureVerdicts(index, ids, criteria, hotelier)
  const counts = verdictCounts(verdicts)
  const levels = levelsOf(index, hotelier)
  const names = new Map(candidates.map((c) => [c.id, c.name]))
  const gathered = new Gathered()
  for (const id of chosen) {
    const own = claims.get(id) ?? []
    const by = criteriaVerdicts(levels.get(id), criteria)
    const reported = quietByHotelier(levels.get(id), criteria)
      ? own.filter((c) => c.property === HOTELIER_NOISE && c.value.kind === 'text')
      : []
    const night = by.night && !reported.length && loudest(own, NIGHT)
    const day = (by.day || by.night) && loudest(own, DAY)
    const height = by.height && own.find((c) => c.property === HEIGHT && c.value.kind === 'number')
    const range = (claim: HotelClaim) =>
      claim.value.kind === 'range'
        ? dayLabel({ min: claim.value.min ?? -Infinity, max: claim.value.max ?? Infinity })
        : ''
    const shown = [
      night && gathered.claim(night, id, 'Фасад на улицу, ночью (23:00–07:00)', range(night)),
      ...reported.map(
        (c) => c.value.kind === 'text' && gathered.claim(c, id, 'Шум в номере, со слов отельера', c.value.value),
      ),
      day && gathered.claim(day, id, 'Фасад на улицу, днём (07:00–19:00)', range(day)),
      height &&
        height.value.kind === 'number' &&
        gathered.claim(
          height,
          id,
          'Высота здания у точки отеля',
          `${formatDecimal(Math.round(height.value.value * 10) / 10)} м`,
        ),
    ].map((c) => c || null)
    const parts = [
      by.night &&
        `ночь: ${VERDICT_NOTE[by.night]}${reported.length ? ` (со слов отельера${reported.some((c) => c.demo) ? ', демо' : ''}; по EEA данных нет)` : ''}`,
      by.day && `день: ${VERDICT_NOTE[by.day]}`,
      by.height && `высота: ${VERDICT_NOTE[by.height]}`,
    ].filter(Boolean)
    gathered.group(id, names.get(id) ?? id, capital(parts.join('; ')), shown)
  }
  const nodata = ids.filter((id) => verdicts.get(id)!.verdict === 'nodata').map((id) => names.get(id) ?? id)
  noDataGroup(gathered, 'nodata', nodata, 'данных по этим характеристикам')
  const label = criteriaLabel(criteria)
  const summary = [
    `${label}: подходят ${counts.match} из ${ofHotels(ids.length)}${where ? ` ${where}` : ''}`,
    counts.nodata > 0 && `нет данных у ${counts.nodata}`,
    incomplete?.length && 'данные неполные',
  ]
    .filter(Boolean)
    .join('; ')
  return gathered.result({
    summary,
    data: { ...counts, chosen: [...chosen] },
    method: {
      name: `Отбор отелей по характеристикам хранилища: оценка шума у фасада (${NOISE_ESTIMATE_METHOD}) ночью и днём, высота здания EUBUCCO`,
      version: '2',
      inputs: [
        { label: 'Условия', value: label },
        { label: 'Отелей проверено', value: String(ids.length) },
      ],
      assumptions: [
        'Ночью отель тише порога, если оценка у фасада на улицу (карты шума EEA и заведения рядом) заканчивается ниже порога',
        'Днём — по оценке у фасада на улицу днём (07:00–19:00)',
        'Отели без характеристики — «нет данных», они не отбираются и не отбрасываются',
        `Слова отельера о шуме в номере читают правила: «тих», «бесшум» — тихо, «шумн», «громк» — шумно, отрицание, оба слова или ни одного — нет данных; тихо закрывает «нет данных» по ночи при пороге от ${QUIET_NIGHT_DB} дБ и никогда не перебивает уровень EEA`,
        'Если отельер отвечал о шуме по-разному, а также если ответ отозван, он не учитывается',
      ],
    },
    limitations: [
      ...FEATURE_LIMITATIONS,
      ...(chosen.some((id) => claims.get(id) === null)
        ? ['Подробности части отелей прочитать не удалось: показаны только итоги отбора']
        : []),
      ...(incomplete?.length
        ? ['Данные неполные: часть запросов по выбранным отелям не ответила, показанного может быть меньше, чем есть']
        : []),
    ],
  })
}

export const placeLabel = (category: NearCategory) => CATEGORY[category].label

const NEAR_LIMITATIONS = [
  'Связи нет — значит, в данных нет такого места в 1 км, а не что его нет на месте: OpenStreetMap и страница Островка не полны',
  'Расстояние по прямой от точки отеля, не путь пешком',
]

export interface NearInput {
  category: NearCategory
  radiusM: number
  candidates: readonly Candidate[]
  chosen: readonly string[]
  where?: string
}

/** A place's name: its own, or what it is. */
const placeName = (row: NearRow | undefined, claim: HotelClaim, category: NearCategory) => {
  const name =
    row?.name ?? claim.evidence.find((e) => e.type === 'osm' && !/^(node|way|relation)\//.test(e.title))?.title
  return name ? `${capital(placeLabel(category))} «${name}»` : capital(placeLabel(category))
}

/**
 * «Места рядом» from the index of the edges `near` of the category and the claims of the chosen hotels' nearest
 * places (`null`: not read): the counts of the choice, and for each chosen hotel its nearest place with the distance's
 * claim and its source, or «в данных нет».
 */
export function nearResult(
  { category, radiusM, candidates, chosen, where }: NearInput,
  index: readonly NearRow[] | null,
  claims: readonly HotelClaim[] | null,
): ToolResult {
  const what = placeLabel(category)
  if (index === null)
    return errorResult('store_unavailable', `Не получилось прочитать места рядом (${what}): хранилище недоступно`, {
      limitations: NEAR_LIMITATIONS,
    })
  const ids = candidates.map((c) => c.id)
  const verdicts = nearVerdicts(index, ids, radiusM)
  const counts = verdictCounts(verdicts)
  const nearest = nearestOf(index)
  const byId = new Map((claims ?? []).map((c) => [c.id, c]))
  const names = new Map(candidates.map((c) => [c.id, c.name]))
  const gathered = new Gathered()
  for (const id of chosen) {
    const row = nearest.get(id)
    const claim = row && byId.get(row.claimId)
    const shown =
      claim && claim.value.kind === 'number'
        ? gathered.claim(claim, id, placeName(row, claim, category), distanceLabel(claim.value.value))
        : null
    const note = !row
      ? `${capital(what)}: в данных нет в ${NEAR_MAX_RADIUS_M} м`
      : row.distanceM <= radiusM
        ? `Ближайшая — в ${distanceLabel(row.distanceM)}: в пределах ${formatMeters(radiusM)}`
        : `Ближайшая — в ${distanceLabel(row.distanceM)}: дальше ${formatMeters(radiusM)}`
    gathered.group(id, names.get(id) ?? id, note, [shown])
  }
  const nodata = ids.filter((id) => verdicts.get(id)!.verdict === 'nodata').map((id) => names.get(id) ?? id)
  noDataGroup(gathered, 'nodata', nodata, `данных о месте «${what}» в ${NEAR_MAX_RADIUS_M} м`)
  return gathered.result({
    summary: [
      `${what} в ${formatMeters(radiusM)}: есть у ${counts.match} из ${ofHotels(ids.length)}${where ? ` ${where}` : ''}`,
      counts.nodata > 0 && `в данных нет у ${counts.nodata}`,
    ]
      .filter(Boolean)
      .join('; '),
    data: { category, radiusM, ...counts, chosen: [...chosen] },
    method: {
      name: 'Ближайшее место категории по связям «рядом» хранилища: места OpenStreetMap и страницы Островка',
      version: '1',
      inputs: [
        { label: 'Место', value: what },
        { label: 'Радиус', value: formatMeters(radiusM) },
        { label: 'Отелей проверено', value: String(ids.length) },
      ],
      assumptions: [
        `Связи «рядом» записаны для мест в ${NEAR_MAX_RADIUS_M} м от точки отеля`,
        'Место, которое есть и в OpenStreetMap, и на странице Островка, — одно, с расстоянием Островка',
      ],
    },
    limitations: [
      ...NEAR_LIMITATIONS,
      ...(claims === null ? ['Подробности мест прочитать не удалось: показаны только итоги отбора'] : []),
    ],
  })
}

/** The sentence names the food with a plain complaint: for «хороший завтрак» it is no source (nothing else is judged). */
const FOOD_COMPLAINT =
  /(?<!\p{L})(?:невкусн|ужасн|отвратительн|гнил|плох|скуд|однообразн|не\s+менял|нет\s+(?:горяч|никаких)|не\s+понрав|разочар)\p{L}*/iu

/** The sentence praises the food in a plain word. */
const FOOD_PRAISE =
  /(?<!\p{L})(?:вкусн|вкуснейш|отличн|прекрасн|великолепн|замечательн|шикарн|супер|похвал|разнообразн|богат|свеж|рекоменд)\p{L}*/iu

const isFood = (topic: ReviewTopic) => topic === 'breakfast' || topic === 'food'

/**
 * The chunks that go on the topic, the praised first: those of the food without a complaint in the sentence that names
 * it, the sentence with a word of praise before the rest (the order of the search stays within each).
 */
const praisedFirst = <C extends { text: string }>(topic: ReviewTopic, chunks: readonly C[]): C[] => {
  if (!isFood(topic)) return [...chunks]
  const sentences = chunks
    .map((c) => ({ c, s: topicExcerpt(c.text, topic) }))
    .filter(({ s }) => !FOOD_COMPLAINT.test(s))
  const praised = ({ s }: { s: string }) => FOOD_PRAISE.test(s)
  return [...sentences.filter(praised), ...sentences.filter((x) => !praised(x))].map(({ c }) => c)
}

/** The hotel's weight by its fragments: a praised one counts ten times a plain mention. */
const praisedScore = (topic: ReviewTopic, chunks: readonly { text: string }[]) =>
  chunks.reduce((sum, c) => sum + (isFood(topic) && FOOD_PRAISE.test(topicExcerpt(c.text, topic)) ? 10 : 1), 0)

/** What the meaning part of the search embeds: the topic and, when the guest said it, their words. */
const reviewMeaning = (topic: ReviewTopic, wish?: string) =>
  wish?.trim() ? `${REVIEW_TOPIC_LABEL[topic]}: ${wish.trim().slice(0, 300)}` : REVIEW_TOPIC_LABEL[topic]

/** The sentence of the chunk on the topic, cut around its word; the chunk's start without one. */
export function topicExcerpt(text: string, topic: ReviewTopic): string {
  const pattern = TOPIC_MENTION[topic]
  const sentence = sentencesOf(text).find((s) => pattern.test(s)) ?? text.trim()
  if (topic === 'noise') return mentionExcerpt(sentence)
  return sentence.length > 300 ? `${sentence.slice(0, 299)}…` : sentence
}

export interface ReviewsInput {
  topic: ReviewTopic
  /** The guest's own words: the meaning part of the search embeds them with the topic («вкусные завтраки»). */
  wish?: string
  candidates: readonly Candidate[]
  chosen: readonly string[]
}

/** What the store gave of a hotel's reviews on the topic: the chunks and their sources (`null`: not read). */
export interface HotelReviews {
  chunks: readonly HotelChunk[] | null
  sources: readonly ClaimEvidence[] | null
}

const REVIEW_CONFIDENCE = confidenceFor('review_mention').confidence

/**
 * «Отзывы» from the chunks of the chosen hotels' reviews on the topic: each fragment a claim «reported» of the guest
 * with the confidence of a review, the review its source with the words quoted. A guest's untrusted text: shown, never
 * followed.
 */
export function reviewsResult({ topic, candidates, chosen }: ReviewsInput, reviews: ReadonlyMap<string, HotelReviews>) {
  const names = new Map(candidates.map((c) => [c.id, c.name]))
  const gathered = new Gathered()
  let found = 0
  let failed = 0
  for (const id of chosen) {
    const own = reviews.get(id)
    if (!own || own.chunks === null || own.sources === null) {
      failed++
      gathered.group(id, names.get(id) ?? id, 'Отзывы прочитать не удалось', [])
      continue
    }
    const sources = new Map(own.sources.map((e) => [e.id, e]))
    const shown: (string | null)[] = []
    const used = new Set<string>()
    for (const chunk of own.chunks) {
      const source = sources.get(chunk.evidenceId)
      if (!source || used.has(source.id) || shown.length >= REVIEWS_PER_HOTEL) continue
      used.add(source.id)
      const excerpt = topicExcerpt(chunk.text, topic)
      shown.push(
        gathered.claim(
          {
            id: chunk.chunkId,
            property: `review.${topic}`,
            sourceKey: chunk.chunkId,
            value: { kind: 'text', value: excerpt },
            unit: null,
            status: 'reported',
            confidence: REVIEW_CONFIDENCE,
            method: {},
            observedAt: null,
            validFrom: null,
            validTo: null,
            limitations: [],
            calculation: null,
            evidence: [{ ...source, excerpt }],
          },
          id,
          `Отзыв гостя: ${REVIEW_TOPIC_LABEL[topic]}`,
          `«${excerpt}»`,
        ),
      )
    }
    found += shown.filter(Boolean).length
    gathered.group(
      id,
      names.get(id) ?? id,
      shown.length > 0 ? null : `Отзывов о теме «${REVIEW_TOPIC_LABEL[topic]}» не нашлось`,
      shown,
    )
  }
  if (failed === chosen.length && chosen.length > 0)
    return errorResult('store_unavailable', 'Не получилось прочитать отзывы: хранилище недоступно')
  return gathered.result({
    summary: `${REVIEW_TOPIC_LABEL[topic]}: ${countRu(found, ['фрагмент', 'фрагмента', 'фрагментов'])} отзывов у ${ofHotels(chosen.length)}`,
    data: { topic, found },
    method: {
      name: 'Поиск по словам и по смыслу в отзывах гостей со страниц Островка',
      version: '2',
      inputs: [
        { label: 'Тема', value: REVIEW_TOPIC_LABEL[topic] },
        { label: 'Слова', value: REVIEW_QUERY[topic].split(' or ').join(', ') },
        { label: 'Смысл', value: REVIEW_TOPIC_LABEL[topic] },
      ],
      assumptions: [`Не больше ${REVIEWS_PER_HOTEL} фрагментов на отель, из разных отзывов`],
    },
    limitations: [
      'Отзывы — слова отдельных гостей, а не измерение',
      'Показаны фрагменты, где тема названа словами: отзыв о ней совсем другими словами не попадёт',
      'Без модели векторов поиск идёт только по словам',
      ...(topic === 'breakfast' || topic === 'food'
        ? ['Фрагменты с явной жалобой («невкусно», «ужасно», «однообразно») не показаны; оценка вкуса — слова гостей']
        : []),
    ],
  })
}

// ——— The reads ———

const failed = (tool: string, error: unknown) =>
  console.warn(`${tool}: failed (${error instanceof Error ? error.name : 'error'})`)

/** Runs «Отели по характеристикам» on the index read before; never throws. */
export async function runFeaturesTool(input: FeaturesInput, index: readonly LevelRow[] | null): Promise<ToolResult> {
  try {
    const real = input.chosen.filter(isRealHotelId)
    const read = await Promise.all(
      real.map(async (id) => {
        const [noise, building, told] = await Promise.all([
          loadHotelClaims(id, 'noise.estimate.street.'),
          loadHotelClaims(id, 'building.'),
          input.hotelier?.length ? loadHotelierClaims(id) : Promise.resolve([]),
        ])
        const own = [noise, building, told && told.filter((c) => c.property === HOTELIER_NOISE)]
        const claims = own.every((c) => c === null) ? null : own.flatMap((c) => c ?? [])
        return [id, claims, claims !== null && own.some((c) => c === null)] as const
      }),
    )
    const incomplete = read.filter(([, , partial]) => partial).map(([id]) => id)
    return featuresResult({ ...input, incomplete }, index, new Map(read.map(([id, claims]) => [id, claims])))
  } catch (error) {
    failed(FEATURES_TOOL, error)
    return errorResult('tool_failed', 'Отбор по характеристикам не удался', { limitations: FEATURE_LIMITATIONS })
  }
}

/** Runs «Места рядом» on the index of the category read before; never throws. */
export async function runNearTool(input: NearInput, index: readonly NearRow[] | null): Promise<ToolResult> {
  try {
    const nearest = index ? nearestOf(index) : new Map<string, NearRow>()
    const ids = input.chosen.flatMap((id) => nearest.get(id)?.claimId ?? [])
    const claims = index ? await loadClaimsByIds(ids) : null
    return nearResult(input, index, claims)
  } catch (error) {
    failed(NEARBY_TOOL, error)
    return errorResult('tool_failed', 'Поиск мест рядом не удался', { limitations: NEAR_LIMITATIONS })
  }
}

/** Runs «Отзывы» for the chosen hotels; never throws. */
export async function runReviewsTool(input: ReviewsInput): Promise<ToolResult> {
  try {
    const vector = input.chosen.some(isRealHotelId)
      ? await queryVectorOrNull(reviewMeaning(input.topic, input.wish))
      : null
    const read = await Promise.all(
      input.chosen.map(async (id) => {
        // A hotel not of the base of Островок has no reviews in the store.
        if (!isRealHotelId(id)) return [id, { chunks: [], sources: [] } as HotelReviews] as const
        const found = await searchHotelReviews(id, REVIEW_QUERY[input.topic], TOPIC_MENTION[input.topic], vector)
        const chunks = found && praisedFirst(input.topic, found)
        const sources = chunks
          ? await loadEvidence(
              id,
              chunks.map((c) => c.evidenceId),
            )
          : null
        return [id, { chunks, sources } as HotelReviews] as const
      }),
    )
    return reviewsResult(input, new Map(read))
  } catch (error) {
    failed(REVIEWS_TOOL, error)
    return errorResult('tool_failed', 'Поиск по отзывам не удался')
  }
}

/** Hotels read at once when the reviews choose: the store answers each from its own indexes. */
const REVIEW_READS = 16

/**
 * The verdict of each hotel by its reviews on the topic: `match` when a review names it without a complaint, the
 * hotel with more praised fragments first, `miss` without one, `nodata` for a hotel not of the base of Островок or one whose reviews could not be read. `null`
 * when none could be read at all.
 */
export async function reviewVerdicts(
  topic: ReviewTopic,
  hotelIds: readonly string[],
  wish?: string,
): Promise<Map<string, HotelVerdict> | null> {
  const real = hotelIds.filter(isRealHotelId)
  const vector = real.length > 0 ? await queryVectorOrNull(reviewMeaning(topic, wish)) : null
  const counts = new Map<string, number | null>()
  for (let from = 0; from < real.length; from += REVIEW_READS)
    await Promise.all(
      real.slice(from, from + REVIEW_READS).map(async (id) => {
        const chunks = await searchHotelReviews(id, REVIEW_QUERY[topic], TOPIC_MENTION[topic], vector)
        counts.set(id, chunks && praisedScore(topic, praisedFirst(topic, chunks)))
      }),
    )
  if (real.length > 0 && [...counts.values()].every((n) => n === null)) return null
  return new Map<string, HotelVerdict>(
    hotelIds.map((id) => {
      const n = counts.get(id)
      if (n === undefined || n === null) return [id, { verdict: 'nodata' as const, score: Infinity }]
      return [id, n > 0 ? { verdict: 'match' as const, score: -n } : { verdict: 'miss' as const, score: 0 }]
    }),
  )
}
