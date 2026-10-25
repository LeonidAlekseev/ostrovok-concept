import 'server-only'
import type { Destination } from '@/data/destinations'
import { planCities, type Brief, type TurnStep } from '@/lib/assistant'
import type { HotelSummary } from '@/lib/catalog'
import type { IsoDate } from '@/lib/dates'
import { countRu } from '@/lib/format'
import {
  CRITERION_LABEL,
  criteriaOf,
  missingCriteria,
  rankByFeatures,
  type Criterion,
  type FeatureWish,
  type HotelFeatures,
} from '@/lib/features'
import { SEMANTIC_TIMEOUT_MS, semanticSearch } from './semantic'

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
}

/** What the steps found, handed from one to the next. */
export interface TurnState {
  /** Hotels for the plan, best first. */
  matches?: HotelSummary[]
  /** The search by meaning's order of hotel ids. */
  semantic?: string[]
  features?: Record<string, HotelFeatures>
  missing?: Criterion[]
}

export interface Step {
  agent: TurnStep['agent']
  /** The line of the step, or `null` to skip it in this turn. */
  title: (context: TurnContext) => string | null
  /** What came of it, for the line; changes `state` for the next steps. */
  run: (context: TurnContext, state: TurnState) => Promise<string | undefined>
}

/** Hotels a turn hands to the plan. */
export const MATCHES = 6
/** The search by meaning needs this much of the answer's time to be worth starting. */
const MIN_SEMANTIC_MS = 1500

const stayCount = (n: number) => countRu(n, ['отель', 'отеля', 'отелей'])

/** Hotels for the traveller's words in the plan's cities; without the search by meaning the plan keeps its rules. */
export const searchStep: Step = {
  agent: 'search',
  title: () => 'Подбираю отели по вашему описанию',
  async run(context, state) {
    const timeoutMs = Math.min(context.deadline - Date.now(), SEMANTIC_TIMEOUT_MS)
    if (timeoutMs < MIN_SEMANTIC_MS) return 'подобрал по каталогу'
    const destinationIds = planCities(context.brief, context.today, context.destinations).map((d) => d.id)
    const result = await semanticSearch(context.wish, {
      destinationIds,
      k: MATCHES,
      timeoutMs,
      signal: context.signal,
    })
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
export const featuresStep: Step = {
  agent: 'features',
  title: ({ brief }) => {
    const criteria = criteriaOf(brief)
    return criteria.length ? criteriaTitle(criteria) : null
  },
  async run(context, state) {
    const { brief } = context
    const cities = new Set(planCities(brief, context.today, context.destinations).map((d) => d.id))
    const [summaries, features] = await Promise.all([context.summaries(), context.features()])
    const inCities = summaries.filter((h) => cities.has(h.destinationId))
    // The search by meaning's hotels first, then the best rated: the tie-break of the ranking.
    const semantic = new Map((state.semantic ?? []).map((id, index) => [id, index]))
    const ids = inCities
      .sort((a, b) => (semantic.get(a.id) ?? Infinity) - (semantic.get(b.id) ?? Infinity) || b.rating - a.rating)
      .map((h) => h.id)
    state.missing = missingCriteria(ids, features, brief)
    const wish: FeatureWish = { quiet: brief.quiet, height: brief.height, view: brief.view }
    const criteria = criteriaOf(wish).filter((c) => !state.missing!.includes(c))
    let ranked: string[] = []
    for (let keep = criteria.length; keep > 0 && ranked.length === 0; keep--) {
      const kept = new Set(criteria.slice(0, keep))
      ranked = rankByFeatures(ids, features, {
        ...(kept.has('quiet') && { quiet: wish.quiet }),
        ...(kept.has('height') && { height: wish.height }),
        ...(kept.has('view') && { view: wish.view }),
      })
    }
    if (ranked.length === 0) return 'нет данных'
    const byId = new Map(inCities.map((h) => [h.id, h]))
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
    try {
      const result = await step.run(context, state)
      done.push({ agent: step.agent, title, status: 'done', ...(result && { result }) })
    } catch (error) {
      if (context.signal.aborted) throw error
      // The kind and the provider's short message; never the request itself.
      console.warn(`assistant: the ${step.agent} step failed (${error instanceof Error ? error.name : 'error'})`)
      done.push({ agent: step.agent, title, status: 'failed', result: 'не получилось — подобрал без этого шага' })
    }
  }
  return { state, steps: done }
}
