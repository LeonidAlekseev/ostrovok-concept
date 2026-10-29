import 'server-only'
import { generateText, tool, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { AssistantRequest, Brief, TurnStep } from '../assistant'
import type { HotelierNoise } from '../db/claims'
import type { LevelRow, NearRow } from '../db/knowledge'
import { recordRun, type RunOwner } from '../db/toolRuns'
import { questionCategories } from '../geo/questions'
import { countRu, formatMeters } from '../format'
import { EPISTEMIC_LABEL, errorResult, type ToolResult, type ToolRun } from '../toolResult'
import { firstAnswer, type ModelLink } from './chain'
import { checkedRemark } from './geoRemark'
import { isRussian } from './hotelAnswer'
import {
  FEATURES_TOOL,
  FEATURES_TOOL_TITLE,
  NEARBY_TOOL,
  NEARBY_TOOL_TITLE,
  NEAR_CATEGORIES,
  NEAR_DEFAULT_RADIUS_M,
  NEAR_MAX_RADIUS_M,
  QUIET_NIGHT_DB,
  REVIEWS_TOOL,
  REVIEWS_TOOL_TITLE,
  REVIEW_TOPICS,
  REVIEW_TOPIC_LABEL,
  chooseHotels,
  criteriaLabel,
  featureVerdicts,
  nearVerdicts,
  placeLabel,
  runFeaturesTool,
  runNearTool,
  reviewVerdicts,
  runReviewsTool,
  type Candidate,
  type FeatureCriteria,
  type HotelVerdict,
  type NearCategory,
  type ReviewTopic,
} from './knowledgeTools'
import { REMARK_MODEL_ID } from './model'

/**
 * Эвал's choice of hotels by what the store knows of them (src/lib/ai/knowledgeTools.ts), once the plan is due and the
 * wish asks of the noise, a place near or the reviews. A model of the chain chooses the calls of the tools with their
 * parameters by tool calling (the rules choose the same tools by the words of the wish without one, or when none
 * answered in time); the indexes of the store choose the hotels every call agrees on; then each call runs as a tool of
 * the contract of its own — in parallel, each a row of `tool_runs` for a signed-in user — and shows the chosen hotels
 * with the claims it went by. The answer is written by rules from the runs' claims — no model can add a number or a
 * source — and a model may add one sentence over them, kept only when it passes the checks of src/lib/ai/geoRemark.ts.
 * The reviews are a guest's untrusted words: the model sees none of them.
 */

export type KnowledgeCall =
  | { tool: 'features'; criteria: FeatureCriteria }
  | { tool: 'near'; category: NearCategory; radiusM: number }
  | { tool: 'reviews'; topic: ReviewTopic }

/** The calls of a turn at most: the answer stays short and in time. */
export const MAX_KNOWLEDGE_CALLS = 5
/** The model chooses the calls in this time at most. */
export const KNOWLEDGE_PLAN_MS = 4000
/** A run of a tool gets this much at most, never past the steps' deadline. */
export const KNOWLEDGE_RUN_MS = 5000
/** Left of the answer's time when the runs end: the answer and its way back. */
export const KNOWLEDGE_RESERVE_MS = 700
/** The model's remark gets this much at most, and only with this much left. */
export const KNOWLEDGE_REMARK_MS = 2000

// ——— The choice of the calls ———

/** «Тихо», «тишина», «не шумно», «без шума», «выспаться»: the night's noise. */
const QUIET = /(?<!\p{L})(?:тих|тиш|не\s+шум|без\s+шума|бесшум|шумоизол|выспат)/iu
/** «Днём тихо», «тихо днём». */
const DAY = /(?<!\p{L})дн[её]м(?!\p{L})/iu
const REVIEW = /(?<!\p{L})отзыв/iu
const TOPIC_WORDS: [ReviewTopic, RegExp][] = [
  ['cleanliness', /(?<!\p{L})(?:чист|грязн|убор)/iu],
  ['staff', /(?<!\p{L})(?:персонал|сотрудник|ресепш|администратор)/iu],
  ['breakfast', /(?<!\p{L})завтрак/iu],
  ['food', /(?<!\p{L})(?:кухн|ресторан|кормят|еда(?!\p{L})|еды(?!\p{L})|ужин)/iu],
  ['comfort', /(?<!\p{L})(?:кроват|матрас|подушк)/iu],
  ['noise', /(?<!\p{L})(?:шум|тих|тиш|громк|слышн)/iu],
  ['location', /(?<!\p{L})(?:расположен|район)/iu],
]
/** «В 300 м», «до 800 метров», «в 1 км» of a place. */
const RADIUS = /(?:в|до|не дальше|ближе)\s+(\d+(?:[.,]\d+)?)\s*(км|километр\p{L}*|м|метр\p{L}*)(?!\p{L})/iu

/** The food asks of the reviews by itself: «хороший завтрак», «отель с отличной кухней» need no word «отзывы». */
const FOOD_TOPICS: readonly ReviewTopic[] = ['breakfast', 'food']

/** The sea is the features' step's (`seaMaxM`): «у моря» is not a place near of these tools by the rules. */
const RULE_CATEGORIES = NEAR_CATEGORIES.filter((c) => c !== 'beach')

/** The radius the wish names, within the store's; the default without one. */
export function radiusOf(text: string): number {
  const match = RADIUS.exec(text)
  if (!match) return NEAR_DEFAULT_RADIUS_M
  const n = Number(match[1].replace(',', '.')) * (/^к/i.test(match[2]) ? 1000 : 1)
  return Math.min(NEAR_MAX_RADIUS_M, Math.max(100, Math.round(n)))
}

/**
 * The calls by the words of the wish and the brief: «тихо ночью» — the night below 50 dB and the reviews on the
 * noise; a place of the store's categories — its nearest within the named radius or 500 m; «отзывы о …» — the
 * reviews on the topic. Empty when the wish asks none of it: the tools are not run.
 */
export function rulesKnowledge(wish: string, brief: Pick<Brief, 'quiet'>): KnowledgeCall[] {
  const calls: KnowledgeCall[] = []
  const quiet = brief.quiet === true || QUIET.test(wish)
  if (quiet)
    calls.push({
      tool: 'features',
      criteria: { nightBelowDb: QUIET_NIGHT_DB, ...(DAY.test(wish) && { dayBelowDb: 55 }) },
    })
  const radiusM = radiusOf(wish)
  for (const category of questionCategories(wish))
    if ((RULE_CATEGORIES as readonly string[]).includes(category))
      calls.push({ tool: 'near', category: category as NearCategory, radiusM })
  const topics = TOPIC_WORDS.filter(
    ([topic, words]) => (REVIEW.test(wish) || FOOD_TOPICS.includes(topic)) && words.test(wish),
  ).map(([t]) => t)
  for (const topic of quiet ? ['noise' as const, ...topics] : topics) calls.push({ tool: 'reviews', topic })
  return normalizeCalls(calls)
}

/** One call of each place and topic, the thresholds of the features joined; at most `MAX_KNOWLEDGE_CALLS`. */
export function normalizeCalls(calls: readonly KnowledgeCall[]): KnowledgeCall[] {
  const criteria: FeatureCriteria = {}
  const near = new Map<NearCategory, number>()
  const topics = new Set<ReviewTopic>()
  for (const call of calls) {
    if (call.tool === 'features') Object.assign(criteria, call.criteria)
    else if (call.tool === 'near') near.set(call.category, Math.min(near.get(call.category) ?? Infinity, call.radiusM))
    else topics.add(call.topic)
  }
  const features = Object.values(criteria).some((v) => v !== undefined)
  return [
    ...(features ? [{ tool: 'features' as const, criteria }] : []),
    ...[...near].map(([category, radiusM]) => ({ tool: 'near' as const, category, radiusM })),
    ...[...topics].map((topic) => ({ tool: 'reviews' as const, topic })),
  ].slice(0, MAX_KNOWLEDGE_CALLS)
}

const featuresInput = z.object({
  nightBelowDb: z.number().int().min(35).max(75).optional().describe('ночной шум (Lnight) ниже, дБ; «тихо ночью» — 50'),
  dayBelowDb: z.number().int().min(35).max(80).optional().describe('дневной шум (оценка Lday) ниже, дБ'),
  heightMinM: z.number().min(0).max(300).optional().describe('высота здания не ниже, м'),
  heightMaxM: z.number().min(0).max(300).optional().describe('высота здания не выше, м'),
})
const nearInput = z.object({
  category: z.enum(NEAR_CATEGORIES as unknown as [NearCategory, ...NearCategory[]]),
  radiusM: z.number().int().min(100).max(NEAR_MAX_RADIUS_M).describe('радиус от отеля, метры; «рядом» — 500'),
})
const reviewsInput = z.object({ topic: z.enum(REVIEW_TOPICS) })

/** The tools as the model sees them to choose the calls: no `execute`, the turn runs each call itself. */
const PLAN_TOOLS = {
  hotelsByFeatures: tool({
    description:
      'Отбор отелей города по характеристикам из хранилища: ночной и дневной шум по карте EEA, высота здания. ' +
      'Отели без данных — «нет данных».',
    inputSchema: featuresInput,
  }),
  nearbyPlaces: tool({
    description:
      'Ближайшее к каждому отелю место категории (аптека, супермаркет, больница, остановка, метро, трамвай, вокзал, ' +
      `пляж, парк) по данным OpenStreetMap и Островка в ${NEAR_MAX_RADIUS_M} м. Один вызов — одна категория.`,
    inputSchema: nearInput,
  }),
  guestReviews: tool({
    description:
      'Фрагменты отзывов гостей подобранных отелей по теме: шум, чистота, персонал, завтрак, кухня и еда, сон, район.',
    inputSchema: reviewsInput,
  }),
}

const PLAN_INSTRUCTIONS = [
  'Ты Эвал, помощник по подбору отелей. Выбери вызовы инструментов, чтобы подобрать отели по последнему пожеланию',
  `гостя. «Тихо», «тихо ночью» — hotelsByFeatures с nightBelowDb ${QUIET_NIGHT_DB} (очень тихо — 45) и guestReviews`,
  'с topic noise. Место рядом (аптека, магазин, остановка, метро, парк) — nearbyPlaces с этой категорией, радиус',
  `${NEAR_DEFAULT_RADIUS_M}, если гость не назвал другой (не больше ${NEAR_MAX_RADIUS_M}). Высокое здание —`,
  'heightMinM 20, невысокое — heightMaxM 12; о высоте не просили — не задавай её. Вызывай только то, о чём просит',
  'гость. Просят хороший завтрак, вкусную кухню — guestReviews с topic breakfast или food. Не больше',
  `${MAX_KNOWLEDGE_CALLS} вызовов.`,
].join(' ')

/** The thresholds that choose: a height from 0 or up to 300 m is none, the model sometimes fills them in. */
export function restrictive({ nightBelowDb, dayBelowDb, heightMinM, heightMaxM }: FeatureCriteria): FeatureCriteria {
  return {
    ...(nightBelowDb !== undefined && { nightBelowDb }),
    ...(dayBelowDb !== undefined && { dayBelowDb }),
    ...(heightMinM !== undefined && heightMinM > 0 && { heightMinM }),
    ...(heightMaxM !== undefined && heightMaxM < 300 && { heightMaxM }),
  }
}

/** The calls the model chose; throws when it chose none, so the next model of the chain is asked. */
export async function modelKnowledge(
  model: LanguageModel,
  messages: AssistantRequest['messages'],
  signal: AbortSignal,
): Promise<KnowledgeCall[]> {
  const { toolCalls } = await generateText({
    model,
    instructions: PLAN_INSTRUCTIONS,
    messages: messages
      .filter((m) => m.role === 'user')
      .slice(-4)
      .map(({ text }) => ({ role: 'user' as const, content: text })),
    tools: PLAN_TOOLS,
    toolChoice: 'required',
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: signal,
  })
  const calls = toolCalls.flatMap((call): KnowledgeCall[] => {
    if (call.toolName === 'hotelsByFeatures') {
      const input = featuresInput.safeParse(call.input)
      return input.success ? [{ tool: 'features', criteria: restrictive(input.data) }] : []
    }
    if (call.toolName === 'nearbyPlaces') {
      const input = nearInput.safeParse(call.input)
      return input.success ? [{ tool: 'near', ...input.data }] : []
    }
    if (call.toolName === 'guestReviews') {
      const input = reviewsInput.safeParse(call.input)
      return input.success ? [{ tool: 'reviews', topic: input.data.topic }] : []
    }
    return []
  })
  const normalized = normalizeCalls(calls)
  if (normalized.length === 0) throw new Error('The model chose no knowledge call')
  return normalized
}

/** What a call is of: the features, a category of places, a topic of reviews. */
const callKey = (call: KnowledgeCall) =>
  call.tool === 'features' ? 'features' : call.tool === 'near' ? `near:${call.category}` : `reviews:${call.topic}`

/**
 * The model's calls with those of the rules it left out: a place or a topic the traveller named is always checked; the
 * model's parameters win for what both chose.
 */
export function withRules(model: readonly KnowledgeCall[], rules: readonly KnowledgeCall[]): KnowledgeCall[] {
  const chosen = new Set(model.map(callKey))
  return normalizeCalls([...model, ...rules.filter((call) => !chosen.has(callKey(call)))])
}

export interface KnowledgePlan {
  calls: KnowledgeCall[]
  planner: 'model' | 'rules'
  /** The models were asked and none chose the calls: the rules did. */
  modelsDown?: true
}

/**
 * The calls of the turn: the model's, or the rules' without the models, when none answered in time, or when the model
 * chose none of the tools the rules see the wish asks.
 */
export async function planKnowledge(
  messages: AssistantRequest['messages'],
  rules: KnowledgeCall[],
  {
    models,
    deadline,
    signal,
    onError,
  }: {
    models?: readonly ModelLink[]
    deadline: number
    signal: AbortSignal
    onError?: (id: string, error: unknown) => void
  },
): Promise<KnowledgePlan> {
  if (!models?.length) return { calls: rules, planner: 'rules' }
  const result = await firstAnswer(models, (model, timeout) => modelKnowledge(model, messages, timeout), {
    deadline,
    signal,
    onError,
  })
  if (result.ok) return { calls: withRules(result.value, rules), planner: 'model' }
  return { calls: rules, planner: 'rules', ...(result.failed.length > 0 && { modelsDown: true as const }) }
}

// ——— The runs ———

/** What the turn reads and runs: the store's in the route, the tests' own. */
export interface KnowledgeDeps {
  levels: () => Promise<LevelRow[] | null>
  hotelierNoise: () => Promise<HotelierNoise[] | null>
  near: (category: NearCategory) => Promise<NearRow[] | null>
  runFeatures: typeof runFeaturesTool
  runNear: typeof runNearTool
  runReviews: typeof runReviewsTool
  reviewVerdicts: typeof reviewVerdicts
  record: typeof recordRun
}

export interface KnowledgeOutcome {
  steps: TurnStep[]
  /** The hotels of the answer, best first. */
  chosen: string[]
  /** Every call agrees on the chosen hotels; otherwise they are the closest, with data lacking. */
  complete: boolean
  /** Эвал's answer from the runs' claims. */
  text: string
  planner: 'model' | 'rules'
  modelsDown?: true
}

/** A run that does not end in time is an error of its own: the others go on. */
async function inTime(execute: () => Promise<ToolResult>, ms: number): Promise<ToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<ToolResult>((resolve) => {
    timer = setTimeout(() => resolve(errorResult('timeout', 'Инструмент не успел ответить')), Math.max(0, ms))
  })
  try {
    return await Promise.race([execute(), late])
  } finally {
    clearTimeout(timer)
  }
}

const TITLE: Record<KnowledgeCall['tool'], string> = {
  features: FEATURES_TOOL_TITLE,
  near: NEARBY_TOOL_TITLE,
  reviews: REVIEWS_TOOL_TITLE,
}
const NAME: Record<KnowledgeCall['tool'], string> = {
  features: FEATURES_TOOL,
  near: NEARBY_TOOL,
  reviews: REVIEWS_TOOL,
}
const AGENT: Record<KnowledgeCall['tool'], TurnStep['agent']> = { features: 'features', near: 'geo', reviews: 'search' }

/** What a call asks, in Russian: «ночью тише 50 дБ», «аптека в 500 м», «отзывы: шум и тишина». */
export function callParams(call: KnowledgeCall): string {
  if (call.tool === 'features') return criteriaLabel(call.criteria)
  if (call.tool === 'near') return `${placeLabel(call.category)} в ${formatMeters(call.radiusM)}`
  return `тема: ${REVIEW_TOPIC_LABEL[call.topic]}`
}

const stepOf = (call: KnowledgeCall, run: ToolRun): TurnStep => ({
  agent: AGENT[call.tool],
  title: TITLE[call.tool],
  params: callParams(call),
  status: run.result.status === 'error' ? 'failed' : 'done',
  result: run.result.summary.slice(0, 300),
  run,
})

/**
 * Runs the calls for the candidates (the hotels of the plan's cities, in the order the earlier steps gave): the
 * indexes choose the hotels all the calls agree on, then each call runs as a tool of its own on them, in parallel.
 */
export async function runKnowledge(
  plan: KnowledgePlan,
  candidates: readonly Candidate[],
  {
    owner,
    deadline,
    deps,
    wish,
  }: {
    owner: RunOwner | null
    deadline: number
    deps: KnowledgeDeps
    /** The guest's words, for the meaning part of the reviews' search. */
    wish?: string
  },
): Promise<Omit<KnowledgeOutcome, 'text'> & { runs: { call: KnowledgeCall; run: ToolRun }[] }> {
  const { calls } = plan
  const ids = candidates.map((c) => c.id)
  const features = calls.some((c) => c.tool === 'features') ? deps.levels() : Promise.resolve(null)
  const categories = [...new Set(calls.flatMap((c) => (c.tool === 'near' ? [c.category] : [])))]
  const near = new Map(categories.map((category) => [category, deps.near(category)]))
  const hotelier = (calls.some((c) => c.tool === 'features') ? await deps.hotelierNoise() : null) ?? []
  const levels = await features
  const nearIndex = new Map(await Promise.all(categories.map(async (c) => [c, await near.get(c)!] as const)))
  const choices: ReadonlyMap<string, HotelVerdict>[] = calls.flatMap((call) => {
    if (call.tool === 'features') return levels ? [featureVerdicts(levels, ids, call.criteria, hotelier)] : []
    if (call.tool === 'near') {
      const index = nearIndex.get(call.category)
      return index ? [nearVerdicts(index, ids, call.radiusM)] : []
    }
    return []
  })
  // The reviews choose too: a hotel whose guests do not name the topic is no answer to «хороший завтрак». Beside the
  // store's measures (the night's noise) they only show: a hotel the map calls quiet is not out for lack of a review.
  const reviewing = calls.flatMap((c) =>
    c.tool === 'reviews' && (choices.length === 0 || FOOD_TOPICS.includes(c.topic)) ? [c.topic] : [],
  )
  const reviewed = await Promise.race([
    Promise.all(reviewing.map((topic) => deps.reviewVerdicts(topic, ids, wish))),
    new Promise<null[]>((resolve) =>
      setTimeout(() => resolve([]), Math.max(0, Math.min(KNOWLEDGE_RUN_MS, deadline - Date.now()))),
    ),
  ])
  for (const verdicts of reviewed) if (verdicts) choices.push(verdicts)
  const { ids: chosen, complete } =
    choices.length > 0 ? chooseHotels(candidates, choices) : { ids: [], complete: false }
  const ms = Math.min(KNOWLEDGE_RUN_MS, deadline - Date.now())
  const runs = await Promise.all(
    calls.map(async (call) => {
      const execute = (): Promise<ToolResult> =>
        call.tool === 'features'
          ? deps.runFeatures({ criteria: call.criteria, candidates, chosen, hotelier }, levels)
          : call.tool === 'near'
            ? deps.runNear(
                { category: call.category, radiusM: call.radiusM, candidates, chosen },
                nearIndex.get(call.category) ?? null,
              )
            : chosen.length > 0
              ? deps.runReviews({ topic: call.topic, wish, candidates, chosen })
              : Promise.resolve(errorResult('no_hotels', 'Отзывы не искал: ни один отель не подобран'))
      const run = await deps.record(owner, NAME[call.tool], callParams(call), () => inTime(execute, ms))
      return { call, run }
    }),
  )
  return {
    runs,
    steps: runs.map(({ call, run }) => stepOf(call, run)),
    chosen,
    complete,
    planner: plan.planner,
    ...(plan.modelsDown && { modelsDown: true as const }),
  }
}

// ——— The answer ———

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)

/** A claim of a run for the answer: «аптека «X» — 180 м (OpenStreetMap, уверенность 100 %)». */
function claimLine(result: ToolResult, claimId: string): string | null {
  const claim = result.claims.find((c) => c.id === claimId)
  if (!claim) return null
  const sources = [
    ...new Set(claim.evidence_ids.flatMap((id) => result.evidence.find((e) => e.id === id)?.source_name ?? [])),
  ]
  const origin = [
    sources.join(', ') || EPISTEMIC_LABEL[claim.status],
    claim.confidence !== null && `уверенность ${Math.round(claim.confidence * 100)} %`,
    claim.demo && 'демо',
  ]
    .filter(Boolean)
    .join(', ')
  const label = claim.label.charAt(0).toLocaleLowerCase('ru') + claim.label.slice(1)
  return `${label} — ${claim.value} (${origin})`
}

/**
 * Эвал's answer from the runs: the conditions, then each chosen hotel with the claims of each run about it — the
 * values, the sources and the confidence as the runs have them — or what the runs did not find; the hotels without
 * data and the calls that failed are said. Nothing but the runs' data.
 */
export function knowledgeAnswer(
  runs: readonly { call: KnowledgeCall; run: ToolRun }[],
  chosen: readonly string[],
  complete: boolean,
  names: ReadonlyMap<string, string>,
): string {
  const conditions = runs
    .filter(({ call }) => call.tool !== 'reviews')
    .map(({ call }) => callParams(call))
    .join(', ')
  const failed = runs.filter(({ run }) => run.result.status === 'error')
  const failedLine =
    failed.length > 0
      ? `Не сработало: ${failed.map(({ call }) => `«${TITLE[call.tool]}» (${callParams(call)})`).join(', ')} — это не проверено.`
      : ''
  if (chosen.length === 0) {
    const choosing = runs.filter(({ call }) => call.tool !== 'reviews')
    const unread = choosing.length > 0 && choosing.every(({ run }) => run.result.status === 'error')
    return unread
      ? `Данные хранилища не прочитались (${conditions}) — по ним не подбирал.`
      : [`По данным хранилища ни один отель не подошёл${conditions ? ` (${conditions})` : ''}.`, failedLine]
          .filter(Boolean)
          .join(' ')
  }
  const head = complete
    ? `Подобрал по данным${conditions ? ` (${conditions})` : ''}:`
    : `Всем условиям сразу (${conditions}) по данным не подошёл ни один отель; ближе всего — эти, но данных у них не хватает:`
  const lines = chosen.map((id, i) => {
    const facts = runs.flatMap(({ call, run }) => {
      if (run.result.status === 'error') return []
      const group = run.result.groups?.find((g) => g.id === id)
      if (!group) return []
      const claims = group.claim_ids.flatMap((c) => claimLine(run.result, c) ?? [])
      if (claims.length > 0) return claims
      // A group without claims says why: «в данных нет», «отзывов не нашлось».
      return group.note && call.tool !== 'features'
        ? [group.note.charAt(0).toLocaleLowerCase('ru') + group.note.slice(1)]
        : []
    })
    return `${i + 1}. ${names.get(id) ?? id}: ${facts.length > 0 ? facts.join('; ') : 'подробностей нет'}.`
  })
  const nodata = runs.flatMap(({ call, run }) => {
    const n = (run.result.data as { nodata?: unknown } | null)?.nodata
    return run.result.status === 'success' && typeof n === 'number' && n > 0 && call.tool !== 'reviews'
      ? [`${callParams(call)} — у ${countRu(n, ['отеля', 'отелей', 'отелей'])}`]
      : []
  })
  const tail = [
    nodata.length > 0 && `Нет данных: ${nodata.join('; ')}. Такие отели я не считаю ни подходящими, ни неподходящими.`,
    failedLine,
    'Отзывы — слова гостей, а уровни шума — карта EEA снаружи здания, не звукоизоляция номера.',
  ]
  return [head, ...lines, ...tail.filter(Boolean)].join('\n')
}

const REMARK_INSTRUCTIONS = [
  'Ты Эвал, помощник по подбору отелей. Гостю уже показан список отелей с фактами из данных. Добавь одну короткую',
  'фразу на русском (до 15 слов) — вывод или практичный совет из фактов. Грамотно, на «вы», по делу. Без цифр и',
  'чисел, без единиц измерения; не называй отелей и мест и не повторяй факты. Только сама фраза, без кавычек.',
  'Вывод только из фактов: никаких общих выводов вроде «чем выше, тем тише», «возьмите беруши», «обычно в отелях…».',
].join(' ')

/** The model's sentence over the facts; throws on an empty answer, so the next model of the chain is asked. */
export async function knowledgeRemark(
  model: LanguageModel,
  wish: string,
  facts: string,
  signal: AbortSignal,
): Promise<string> {
  const { text } = await generateText({
    model,
    instructions: REMARK_INSTRUCTIONS,
    prompt: `Пожелание гостя: ${wish.slice(0, 500)}\nФакты подбора (без цитат отзывов):\n${facts}`,
    reasoning: 'none',
    maxOutputTokens: 120,
    maxRetries: 0,
    abortSignal: signal,
  })
  if (!text.trim() || !isRussian(text)) throw new Error('The model gave no remark')
  return text
}

/** The facts without the guests' words: the model gets no untrusted text. */
export const factsForModel = (text: string) => text.replace(/«[^»]*»/g, '«…»')

/** The chain for the remark: `REMARK_MODEL_ID` first, the rest in their order. */
const remarkModels = (models: readonly ModelLink[]) => [
  ...models.filter((m) => m.id === REMARK_MODEL_ID),
  ...models.filter((m) => m.id !== REMARK_MODEL_ID),
]

/**
 * The whole of the choice: the plan (begun by the route as soon as the wish is known), the runs, the answer, and a
 * remark of the model when there is time for it.
 */
export async function knowledgeTurn(
  plan: Promise<KnowledgePlan>,
  candidates: readonly Candidate[],
  {
    wish,
    owner,
    models,
    deadline,
    signal,
    deps,
    onError,
  }: {
    wish: string
    owner: Promise<RunOwner | null>
    models?: readonly ModelLink[]
    deadline: number
    signal: AbortSignal
    deps: KnowledgeDeps
    onError?: (id: string, error: unknown) => void
  },
): Promise<KnowledgeOutcome> {
  const [planned, runOwner] = await Promise.all([plan, owner])
  const outcome = await runKnowledge(planned, candidates, {
    owner: runOwner,
    deadline: deadline - KNOWLEDGE_RESERVE_MS,
    deps,
    wish,
  })
  const names = new Map(candidates.map((c) => [c.id, c.name]))
  const facts = knowledgeAnswer(outcome.runs, outcome.chosen, outcome.complete, names)
  let text = facts
  const until = deadline - KNOWLEDGE_RESERVE_MS
  if (models?.length && outcome.chosen.length > 0 && until - Date.now() >= KNOWLEDGE_REMARK_MS) {
    const remark = await firstAnswer(
      remarkModels(models),
      (model, timeout) => knowledgeRemark(model, wish, factsForModel(facts), timeout),
      { deadline: Math.min(Date.now() + KNOWLEDGE_REMARK_MS, until), signal, onError },
    )
    const kept = remark.ok ? checkedRemark(remark.value, factsForModel(facts)) : undefined
    if (kept) text = `${facts}\n${sentence(kept)}`
  }
  const { runs: _runs, ...rest } = outcome
  return { ...rest, text }
}
