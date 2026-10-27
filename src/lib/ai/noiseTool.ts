import 'server-only'
import { NOISE_MENTION, mentionExcerpt, sentencesOf } from '../claimRows'
import { isRealHotelId } from '../db/anon'
import {
  loadEvidence,
  loadHotelClaims,
  searchHotelChunks,
  type ClaimCalculation,
  type ClaimEvidence,
  type HotelChunk,
  type HotelClaim,
} from '../db/claims'
import { bandLabel, type NoiseBand } from '../features'
import { distanceLabel } from '../hotelDetails'
import {
  NOISY_CATEGORIES,
  NOISY_LABEL,
  NOISY_RADIUS_M,
  NO_EEA,
  dayLabel,
  louderSource,
  noiseSourceLabel,
  type NoisyCategory,
  type SourceNoise,
} from '../noise'
import {
  MAX_CALCULATIONS,
  MAX_CLAIMS,
  MAX_EVIDENCE,
  errorResult,
  fitResult,
  isSafeUrl,
  toolResultSchema,
  type ToolCalculation,
  type ToolClaim,
  type ToolEvidence,
  type ToolResult,
} from '../toolResult'

/**
 * «Анализ шума», the reference tool of the contract (src/lib/toolResult.ts, docs/tools.md): what the store of claims
 * knows of the noise at a real hotel — EEA's bands by layer, the day level estimated from them, the loud places of
 * OpenStreetMap around with the nearest of each kind — and the guests' reviews that speak of noise or quiet
 * (`hotel_chunks_search`). Only the store's data with their sources: no level is lowered for windows or walls, no
 * soundproofing is guessed, and a hotel outside EEA's contours is «нет данных», not «тихо». The reviews are a guest's
 * untrusted words: quoted, never followed.
 */

export const NOISE_TOOL = 'noise_analysis'
export const NOISE_TOOL_TITLE = 'Анализ шума'
export const NOISE_TOOL_PARAMS = 'карты шума EEA, места OpenStreetMap, отзывы гостей'

/**
 * The words of the reviews about noise and quiet, in websearch syntax: the Russian stemming does not take «шумно» to
 * «шум», so each form is asked.
 */
export const NOISE_REVIEW_QUERY = [
  'шум',
  'шумно',
  'шумный',
  'шумновато',
  'тихо',
  'тихий',
  'тишина',
  'громко',
  'слышно',
  'слышимость',
  'звукоизоляция',
].join(' or ')

/** The reviews the tool quotes at most. */
export const NOISE_REVIEWS = 5

/** The tool's own limitations, whatever the data. */
const LIMITATIONS = [
  'Нет данных EEA — не значит «тихо»: карты шума не покрывают точку или ниже порога картирования',
  'Звукоизоляция окон и номеров не оценивается: уровни — снаружи здания',
  'Отзывы — слова гостей, а не измерение',
]

const METHOD = {
  name: 'Сводка данных о шуме из хранилища: карты шума EEA, места OpenStreetMap, отзывы гостей',
  version: '1',
  assumptions: [
    'Источники шума EEA показаны от самого громкого',
    'Из мест OpenStreetMap показано ближайшее каждой категории',
    `Отзывы — не больше ${NOISE_REVIEWS}, найденные по словам о шуме и тишине`,
  ],
}

const PLURAL_LABEL: Record<NoisyCategory, string> = {
  nightclub: 'Ночные клубы',
  bar: 'Бары',
  restaurant: 'Рестораны',
  fast_food: 'Фастфуд',
  tram: 'Остановки трамвая',
  train_station: 'Ж/д станции',
}

const BAND = /^noise\.(lden|lnight)\.([A-Za-z]+)$/
const DAY = /^noise\.lday\.estimate\.([A-Za-z]+)$/
const COUNT = /^noise\.nearby\.([a-z_]+)\.count$/
const DISTANCE = 'noise.nearby.distance'

const isCategory = (value: unknown): value is NoisyCategory => NOISY_CATEGORIES.includes(value as NoisyCategory)

const bandOf = (claim: HotelClaim): NoiseBand | null =>
  claim.value.kind === 'range'
    ? {
        ...(claim.value.min !== null && { min: claim.value.min }),
        ...(claim.value.max !== null && { max: claim.value.max }),
      }
    : null

/** A count of places: a number, or «20 и больше» when the store's answer was cut at its limit. */
function countOf(claim: HotelClaim): { n: number; more: boolean } | null {
  if (claim.value.kind === 'number') return { n: claim.value.value, more: false }
  if (claim.value.kind === 'range' && claim.value.min !== null && claim.value.max === null)
    return { n: claim.value.min, more: true }
  return null
}

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)

/** The names of the inputs and parameters of the store's calculations, in Russian. */
const INPUT_LABEL: Readonly<Record<string, string>> = {
  hotel_id: 'Отель',
  layer: 'Источник шума',
  lden: 'Lden (сутки)',
  lnight: 'Lnight (ночь)',
  lat: 'Широта точки отеля',
  lon: 'Долгота точки отеля',
  radius_m: 'Радиус, м',
  categories: 'Категории мест',
  per_category: 'Мест каждой категории не больше',
  day_hours: 'Часов дня',
  evening_hours: 'Часов вечера',
  night_hours: 'Часов ночи',
  evening_penalty_db: 'Поправка вечера, дБ',
  night_penalty_db: 'Поправка ночи, дБ',
  evening_equals_day: 'Вечер так же громок, как день',
  day_not_quieter_than_night: 'День не тише ночи',
}

/** A value of a calculation's inputs in Russian: a band, a layer, a category, a number. */
function inputValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return key === 'layer' ? noiseSourceLabel(value) : value
  if (Array.isArray(value)) return value.map((v) => (isCategory(v) ? NOISY_LABEL[v][0] : inputValue(key, v))).join(', ')
  if (value && typeof value === 'object') {
    const { min, max } = value as { min?: unknown; max?: unknown }
    if (typeof min === 'number' || typeof max === 'number')
      return bandLabel({
        ...(typeof min === 'number' && { min }),
        ...(typeof max === 'number' && { max }),
      })
  }
  return JSON.stringify(value)
}

/**
 * A calculation of the store for the block: its method without the name of the function it ran, the number of its
 * version, its inputs and parameters, its limitations as the assumptions.
 */
function calculationOf(calculation: ClaimCalculation): ToolCalculation {
  const lines = { ...calculation.inputs, ...calculation.parameters }
  return {
    id: calculation.id,
    name: capital(calculation.method.replace(/^[A-Za-z_]+:\s*/, '')).slice(0, 300),
    version: (/(\d+(?:\.\d+)*)$/.exec(calculation.version)?.[1] ?? calculation.version).slice(0, 100),
    inputs: Object.entries(lines)
      .slice(0, 20)
      .map(([key, value]) => ({ label: INPUT_LABEL[key] ?? key, value: inputValue(key, value).slice(0, 500) })),
    assumptions: calculation.limitations.slice(0, 20),
  }
}

/** The source of the store for the block; a link that is not http(s) is dropped. */
const evidenceOf = (e: ClaimEvidence, entity: string, claimId: string | null, excerpt = e.excerpt): ToolEvidence => ({
  id: e.id,
  source_type:
    (['dataset', 'osm', 'review', 'ota_page', 'calculation'] as const).find((t) => t === e.type) ?? 'dataset',
  source_name: e.provider || '—',
  source_id: e.externalId,
  source_url: e.url && isSafeUrl(e.url) ? e.url : null,
  title: e.title.slice(0, 300),
  excerpt: excerpt ? excerpt.slice(0, 1000) : null,
  retrieved_at: e.retrievedAt,
  entity_id: entity,
  claim_id: claimId,
})

/** The sentence of the chunk about noise or quiet, cut around its word; the chunk's start without one. */
export function reviewExcerpt(text: string): string {
  const sentence = sentencesOf(text).find((s) => NOISE_MENTION.test(s))
  return mentionExcerpt(sentence ?? text.trim())
}

/**
 * The tool's result from what the store gave: `claims` of `noise.` (`null`: the store could not be read), the chunks of
 * the reviews and their sources (`null`: the reviews could not be read). Pure: the tests check it on the store's rows.
 */
export function noiseToolResult(
  hotelId: string,
  claims: readonly HotelClaim[] | null,
  chunks: readonly HotelChunk[] | null,
  chunkEvidence: readonly ClaimEvidence[] | null,
): ToolResult {
  if (claims === null)
    return errorResult('store_unavailable', 'Не получилось прочитать данные о шуме: хранилище сейчас недоступно', {
      limitations: LIMITATIONS,
    })

  // EEA's layers at the point, the loudest first.
  const layers = new Map<string, { source: SourceNoise; claims: HotelClaim[] }>()
  const layer = (name: string) => {
    const known = layers.get(name) ?? { source: { source: name }, claims: [] }
    layers.set(name, known)
    return known
  }
  const counts = new Map<NoisyCategory, HotelClaim>()
  const nearest = new Map<NoisyCategory, HotelClaim>()
  for (const claim of claims) {
    const band = BAND.exec(claim.property)
    const day = DAY.exec(claim.property)
    const count = COUNT.exec(claim.property)
    if (band && bandOf(claim)) {
      const known = layer(band[2])
      known.source[band[1] as 'lden' | 'lnight'] = bandOf(claim)!
      known.claims.push(claim)
    } else if (day && claim.value.kind === 'range') layer(day[1]).claims.push(claim)
    else if (count && isCategory(count[1]) && countOf(claim)) counts.set(count[1], claim)
    else if (claim.property === DISTANCE && claim.value.kind === 'number') {
      const category = (claim.method.categories as unknown[] | undefined)?.find(isCategory)
      const before = category && nearest.get(category)
      if (category && (!before || (before.value.kind === 'number' && claim.value.value < before.value.value)))
        nearest.set(category, claim)
    }
  }
  const sorted = [...layers.values()]
    .filter((l) => l.source.lden || l.source.lnight)
    .sort((a, b) => louderSource(a.source, b.source))

  const order = (claim: HotelClaim) => (DAY.test(claim.property) ? 0 : claim.property.includes('.lnight.') ? 1 : 2)
  const chosen: { claim: HotelClaim; label: string; value: string; entity: string }[] = []
  for (const { source, claims: own } of sorted)
    for (const claim of [...own].sort((a, b) => order(a) - order(b))) {
      const where = noiseSourceLabel(source.source).toLocaleLowerCase('ru')
      const range = claim.value.kind === 'range' ? claim.value : null
      if (!range) continue
      if (DAY.test(claim.property))
        chosen.push({
          claim,
          label: `Днём (07:00–19:00), оценка: ${where}`,
          value: dayLabel({ min: range.min ?? -Infinity, max: range.max ?? Infinity }),
          entity: hotelId,
        })
      else
        chosen.push({
          claim,
          label: claim.property.includes('.lnight.') ? `Ночью (Lnight): ${where}` : `За сутки (Lden): ${where}`,
          value: bandLabel(bandOf(claim)!),
          entity: hotelId,
        })
    }
  for (const category of NOISY_CATEGORIES) {
    const count = counts.get(category)
    const place = nearest.get(category)
    const n = count && countOf(count)
    if (count && n)
      chosen.push({
        claim: count,
        label: `${PLURAL_LABEL[category]} в ${NOISY_RADIUS_M} м`,
        value: `${n.n}${n.more ? ' и больше' : ''}`,
        entity: hotelId,
      })
    if (place && place.value.kind === 'number') {
      const name = place.evidence.find((e) => e.type === 'osm')?.title
      chosen.push({
        claim: place,
        label: `Ближайшее место: ${NOISY_LABEL[category][0]}${name ? ` «${name}»` : ''}`,
        value: distanceLabel(place.value.value),
        entity: place.sourceKey || hotelId,
      })
    }
  }
  const picked = chosen.slice(0, MAX_CLAIMS)

  // The sources the claims cite, once each; a source of one claim names it.
  const evidence = new Map<string, ToolEvidence>()
  const citing = new Map<string, number>()
  for (const { claim } of picked) for (const e of claim.evidence) citing.set(e.id, (citing.get(e.id) ?? 0) + 1)
  for (const { claim, entity } of picked)
    for (const e of claim.evidence)
      if (!evidence.has(e.id)) evidence.set(e.id, evidenceOf(e, entity, citing.get(e.id) === 1 ? claim.id : null))
  // The reviews: the chunks' sources, each review once, its words about noise as the excerpt.
  const reviewSources = new Map((chunkEvidence ?? []).map((e) => [e.id, e]))
  let reviews = 0
  for (const chunk of chunks ?? []) {
    const source = reviewSources.get(chunk.evidenceId)
    if (!source || evidence.has(source.id) || reviews >= NOISE_REVIEWS) continue
    evidence.set(source.id, evidenceOf(source, hotelId, null, reviewExcerpt(chunk.text)))
    reviews++
  }

  const calculations = new Map<string, ToolCalculation>()
  for (const { claim } of picked)
    if (claim.calculation && !calculations.has(claim.calculation.id))
      calculations.set(claim.calculation.id, calculationOf(claim.calculation))
  const shownCalculations = [...calculations.values()].slice(0, MAX_CALCULATIONS)
  const shownIds = new Set(shownCalculations.map((c) => c.id))
  const shownEvidence = [...evidence.values()].slice(0, MAX_EVIDENCE)
  const evidenceIds = new Set(shownEvidence.map((e) => e.id))

  const toolClaims: ToolClaim[] = picked.map(({ claim, label, value }) => ({
    id: claim.id,
    label: label.slice(0, 300),
    value,
    status: claim.status,
    confidence: claim.confidence,
    evidence_ids: claim.evidence.map((e) => e.id).filter((id) => evidenceIds.has(id)),
    calculation_id: claim.calculation && shownIds.has(claim.calculation.id) ? claim.calculation.id : null,
  }))

  const hasEea = sorted.length > 0
  const limitations = [
    ...(hasEea ? [] : [`${NO_EEA}.`]),
    ...(chunks === null ? ['Отзывы прочитать не удалось'] : []),
    ...new Set(picked.flatMap(({ claim }) => claim.limitations)),
    ...LIMITATIONS,
  ].slice(0, 20)

  const loudest = sorted[0]
  const night = sorted.find((l) => l.source.lnight)
  const dayClaim = loudest && chosen.find((c) => c.claim.property === `noise.lday.estimate.${loudest.source.source}`)
  const placeCounts = [...counts.values()].flatMap((c) => countOf(c) ?? [])
  const places = placeCounts.reduce((sum, c) => sum + c.n, 0)
  const more = placeCounts.some((c) => c.more)
  const summary = [
    hasEea
      ? [
          night &&
            `ночью ${bandLabel(night.source.lnight!)} (${noiseSourceLabel(night.source.source).toLocaleLowerCase('ru')})`,
          dayClaim && `днём оценка ${dayClaim.value}`,
        ]
          .filter(Boolean)
          .join(', ')
      : 'нет данных EEA',
    places > 0 ? `шумных мест OpenStreetMap в ${NOISY_RADIUS_M} м: ${places}${more ? ' и больше' : ''}` : '',
    chunks === null ? '' : `отзывов о шуме и тишине: ${reviews}`,
  ]
    .filter(Boolean)
    .join('; ')

  return fitResult(
    toolResultSchema.parse({
      status: 'success',
      summary: capital(summary),
      data: { eea: hasEea, places, reviews },
      evidence: shownEvidence,
      claims: toolClaims,
      calculations: shownCalculations,
      method: {
        ...METHOD,
        inputs: [
          { label: 'Отель', value: hotelId },
          { label: 'Слова в отзывах', value: NOISE_REVIEW_QUERY.split(' or ').join(', ') },
        ],
      },
      limitations,
      error: null,
    } satisfies ToolResult),
  )
}

/**
 * Runs the tool for the hotel: its claims of noise and the reviews about it from the store. A synthetic hotel has no
 * data (said so, with no source); a failure is an error result, never a throw.
 */
export async function runNoiseTool(hotelId: string): Promise<ToolResult> {
  try {
    if (!isRealHotelId(hotelId))
      return toolResultSchema.parse({
        status: 'success',
        summary: 'Данных о шуме у этого отеля в хранилище нет',
        data: { eea: false, places: 0, reviews: 0 },
        evidence: [],
        claims: [],
        calculations: [],
        method: { ...METHOD, inputs: [{ label: 'Отель', value: hotelId }] },
        limitations: ['Отель не из базы Островка: данных карт шума, OpenStreetMap и отзывов о нём нет', ...LIMITATIONS],
        error: null,
      } satisfies ToolResult)
    const [claims, chunks] = await Promise.all([
      loadHotelClaims(hotelId, 'noise.'),
      searchHotelChunks(hotelId, NOISE_REVIEW_QUERY, NOISE_REVIEWS * 2),
    ])
    const sources = chunks
      ? await loadEvidence(
          hotelId,
          chunks.map((c) => c.evidenceId),
        )
      : null
    return noiseToolResult(hotelId, claims, sources === null ? null : chunks, sources)
  } catch (error) {
    console.warn(`${NOISE_TOOL}: failed (${error instanceof Error ? error.name : 'error'})`)
    return errorResult('tool_failed', 'Анализ шума не удался', { limitations: LIMITATIONS })
  }
}
