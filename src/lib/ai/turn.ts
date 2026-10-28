import 'server-only'
import type { Destination } from '@/data/destinations'
import { planCities, type Brief, type TurnStep } from '@/lib/assistant'
import type { HotelSummary } from '@/lib/catalog'
import type { IsoDate } from '@/lib/dates'
import { countRu, formatMeters } from '@/lib/format'
import {
  CRITERION_LABEL,
  VIEW_LABEL,
  criteriaOf,
  missingCriteria,
  rankByFeatures,
  type Criterion,
  type FeatureWish,
  type HotelFeatures,
} from '@/lib/features'
import { SEMANTIC_TIMEOUT_MS, semanticSearch, type SemanticResult } from './semantic'

/**
 * Эвал's turn once the plan is due: a sequence of steps, each one of its agents. Now the search by meaning picks
 * the hotels and the features step checks their building, noise and views; new agents (the map, the hotel's owner)
 * come as new steps. A step that throws is reported as failed and the turn goes on with what it has.
 */

export interface TurnContext {
  brief: Brief
  /** All the traveller's messages: «тихо» from the first one still counts. */
  wish: string
  today: IsoDate
  destinations: readonly Destination[]
  /** When the whole answer is due, ms since the epoch. */
  deadline: number
  signal: AbortSignal
  summaries: () => Promise<HotelSummary[]>
  features: () => Promise<ReadonlyMap<string, HotelFeatures>>
  /**
   * The tools of the store choose by the noise after these steps (src/lib/ai/knowledgeTurn.ts): the features step
   * leaves the quiet to them.
   */
  knowledge?: boolean
}

/** What the steps found, handed from one to the next. */
export interface TurnState {
  /** Hotels for the plan, best first. */
  matches?: HotelSummary[]
  /** The search by meaning's order of hotel ids. */
  semantic?: string[]
  features?: Record<string, HotelFeatures>
  /** Every hotel of the plan's cities the features step kept, best first: the tools of the store choose among them. */
  ranked?: string[]
  missing?: Criterion[]
  /** The search by meaning failed, its retry too: the rules picked the hotels and the answer says the models are down. */
  semanticDown?: true
}

export interface Step {
  agent: TurnStep['agent']
  /** The line of the step, or `null` to skip it in this turn. */
  title: (context: TurnContext) => string | null
  /** What the step is called with, briefly in Russian: «Валенсия», «до моря до 1 км». */
  params?: (context: TurnContext) => string | undefined
  /** What came of it, for the line; changes `state` for the next steps. */
  run: (context: TurnContext, state: TurnState) => Promise<string | undefined>
}

/** Hotels a turn hands to the plan. */
export const MATCHES = 6
/** The search by meaning needs this much of the answer's time to be worth starting; so does its retry. */
const MIN_SEMANTIC_MS = 1500

const stayCount = (n: number) => countRu(n, ['отель', 'отеля', 'отелей'])

/** The cities a step looks in: «Валенсия», «Валенсия, Барселона, Лиссабон и ещё 10». */
const CITIES_SHOWN = 3
export function citiesParam(cities: readonly Destination[]): string | undefined {
  if (cities.length === 0) return undefined
  const named = cities
    .slice(0, CITIES_SHOWN)
    .map((d) => d.name)
    .join(', ')
  return cities.length > CITIES_SHOWN ? `${named} и ещё ${cities.length - CITIES_SHOWN}` : named
}

/** What the features step checks: «до моря до 1 км · тихо ночью · здание повыше · вид на море». */
export function criteriaParam(wish: FeatureWish): string | undefined {
  const parts = [
    wish.seaMaxM && `до моря до ${formatMeters(wish.seaMaxM)}`,
    wish.quiet && 'тихо ночью',
    wish.height && (wish.height === 'high' ? 'здание повыше' : 'здание пониже'),
    wish.view && (wish.view === 'any' ? 'вид из окна' : `вид ${VIEW_LABEL[wish.view]}`),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** Failures a retry may fix; with `no-key`, `aborted` or an empty result the search is not down. */
const retryable = (result: SemanticResult) =>
  result.status === 'failed' && ['timeout', 'model', 'database'].includes(result.reason)

/**
 * Hotels for the traveller's words in the plan's cities; without the search by meaning the plan keeps its rules. A
 * failed search is tried once more when the answer's time allows; when the retry fails too, the rules pick the hotels
 * and the state says the models are down.
 */
export const searchStep: Step = {
  agent: 'search',
  title: () => 'Подбираю отели по вашему описанию',
  params: ({ brief, today, destinations }) => citiesParam(planCities(brief, today, destinations)),
  async run(context, state) {
    const left = context.deadline - Date.now()
    if (left < MIN_SEMANTIC_MS) return 'подобрал по каталогу'
    const destinationIds = planCities(context.brief, context.today, context.destinations).map((d) => d.id)
    const search = (timeoutMs: number) =>
      semanticSearch(context.wish, { destinationIds, k: MATCHES, timeoutMs, signal: context.signal })
    // The first try leaves the retry its minimum: a try that times out still has time for the second one.
    let result = await search(Math.min(SEMANTIC_TIMEOUT_MS, Math.max(left - MIN_SEMANTIC_MS, MIN_SEMANTIC_MS)))
    if (retryable(result)) {
      const retryMs = Math.min(SEMANTIC_TIMEOUT_MS, context.deadline - Date.now())
      if (retryMs >= MIN_SEMANTIC_MS) result = await search(retryMs)
    }
    if (retryable(result)) {
      state.semanticDown = true
      return 'модель не ответила — подобрал по правилам'
    }
    if (result.status !== 'found') return 'подобрал по каталогу'
    const byId = new Map((await context.summaries()).map((h) => [h.id, h]))
    const matches = result.hits.flatMap((hit) => byId.get(hit.id) ?? [])
    if (matches.length === 0) return 'подобрал по каталогу'
    state.matches = matches
    state.semantic = matches.map((h) => h.id)
    return `нашёл ${stayCount(matches.length)}`
  },
}

const criteriaTitle = (criteria: readonly Criterion[]) =>
  `Проверяю данные о ${criteria.map((c) => CRITERION_LABEL[c]).join(', ')}`

/**
 * The hotels of the plan's cities that have the data the traveller asked for, best first. When none has it for all
 * the criteria, the last ones are let go one by one; the criteria no hotel has data for are `missing`.
 */
/** The brief the features step goes by: without the quiet when the tools of the store choose by it. */
const featureBrief = ({ brief, knowledge }: Pick<TurnContext, 'brief' | 'knowledge'>): Brief =>
  knowledge ? { ...brief, quiet: undefined } : brief

export const featuresStep: Step = {
  agent: 'features',
  title: (context) => {
    const criteria = criteriaOf(featureBrief(context))
    return criteria.length ? criteriaTitle(criteria) : null
  },
  params: (context) => criteriaParam(featureBrief(context)),
  async run(context, state) {
    const brief = featureBrief(context)
    const cities = new Set(planCities(brief, context.today, context.destinations).map((d) => d.id))
    const [summaries, features] = await Promise.all([context.summaries(), context.features()])
    const inCities = summaries.filter((h) => cities.has(h.destinationId))
    // The search by meaning's hotels first, then the best rated: the tie-break of the ranking.
    const semantic = new Map((state.semantic ?? []).map((id, index) => [id, index]))
    const ids = inCities
      .sort((a, b) => (semantic.get(a.id) ?? Infinity) - (semantic.get(b.id) ?? Infinity) || b.rating - a.rating)
      .map((h) => h.id)
    state.missing = missingCriteria(ids, features, brief)
    const wish: FeatureWish = { seaMaxM: brief.seaMaxM, quiet: brief.quiet, height: brief.height, view: brief.view }
    const criteria = criteriaOf(wish).filter((c) => !state.missing!.includes(c))
    let ranked: string[] = []
    for (let keep = criteria.length; keep > 0 && ranked.length === 0; keep--) {
      const kept = new Set(criteria.slice(0, keep))
      ranked = rankByFeatures(ids, features, {
        ...(kept.has('sea') && { seaMaxM: wish.seaMaxM }),
        ...(kept.has('quiet') && { quiet: wish.quiet }),
        ...(kept.has('height') && { height: wish.height }),
        ...(kept.has('view') && { view: wish.view }),
      })
    }
    // The sea is never let go: no hotel within the distance is the answer «ничего не нашёл».
    if (ranked.length === 0)
      return criteria.includes('sea') ? `ни одного ближе ${formatMeters(wish.seaMaxM!)} к морю` : 'нет данных'
    const byId = new Map(inCities.map((h) => [h.id, h]))
    state.ranked = ranked
    state.matches = ranked.slice(0, MATCHES).map((id) => byId.get(id)!)
    state.features = Object.fromEntries(
      state.matches.flatMap((h) => (features.has(h.id) ? [[h.id, features.get(h.id)!]] : [])),
    )
    return `подходят ${stayCount(ranked.length)} из ${ids.length}`
  },
}

export const TURN_STEPS: readonly Step[] = [searchStep, featuresStep]

/** Runs the steps in order; each one's line and result go to `steps`. */
export async function runTurn(
  context: TurnContext,
  steps: readonly Step[] = TURN_STEPS,
): Promise<{ state: TurnState; steps: TurnStep[] }> {
  const state: TurnState = {}
  const done: TurnStep[] = []
  for (const step of steps) {
    const title = step.title(context)
    if (title === null) continue
    const params = step.params?.(context)
    const call = { agent: step.agent, title, ...(params && { params }) }
    try {
      const result = await step.run(context, state)
      done.push({ ...call, status: 'done', ...(result && { result }) })
    } catch (error) {
      if (context.signal.aborted) throw error
      // The kind and the provider's short message; never the request itself.
      console.warn(`assistant: the ${step.agent} step failed (${error instanceof Error ? error.name : 'error'})`)
      done.push({ ...call, status: 'failed', result: 'не получилось — подобрал без этого шага' })
    }
  }
  return { state, steps: done }
}
