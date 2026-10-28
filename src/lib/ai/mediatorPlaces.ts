import 'server-only'
import type { TurnStep } from '../assistant'
import type { Hotel } from '../catalog'
import type { HotelDetails } from '../hotelDetails'
import { isHotelGeoQuestion, isHotelViewQuestion, isNoiseQuestion } from '../noise'
import { toolResultSchema, type ToolEvidence, type ToolResult } from '../toolResult'
import type { ModelLink } from './chain'
import { geoTurn, type GeoOutcome } from './geoTurn'
import { ruleAnswer } from './hotelAnswer'
import { runNoiseTool } from './noiseTool'
import { viewTurn } from './viewTurn'

/**
 * What the hotel's assistant knows of the hotel beyond its page, as Эвал does (hotelier-chat): the distance to the
 * beach and the places near (geo steps), the noise at the facade (the tool «Анализ шума») and the view from the
 * windows (view steps). The same steps as Эвал's `hotelTurn`, so the answer is the same text with the same
 * estimates («по оценке», «≈»); the sources are the datasets the steps read. `null`: the question is not of these
 * kinds or they have no data — the model and the hotelier take it from there.
 */

export interface PlacesAnswer {
  answer: string
  result: ToolResult
}

export interface PlacesOptions {
  details: HotelDetails | null
  models?: readonly ModelLink[]
  deadline: number
  signal: AbortSignal
  onError?: (id: string, error: unknown) => void
}

const LIMITATIONS = [
  'Ответ AI-помощника по сохранённым данным, не отельера',
  'Расстояния и вид — оценка по картам и данным о зданиях, не гарантия отеля',
]

const dataset = (id: string, name: string, title: string, excerpt: string | null): ToolEvidence => ({
  id,
  source_type: name === 'Островок' ? 'ota_page' : name === 'OpenStreetMap' ? 'osm' : 'dataset',
  source_name: name,
  source_id: null,
  source_url: null,
  title,
  excerpt,
  retrieved_at: null,
  entity_id: null,
  claim_id: null,
})

/** The datasets a geo or view outcome read: its steps (`geo`) name the Ostrovok page, OSM and the EUBUCCO buildings. */
function stepEvidence(kind: 'geo' | 'view', steps: readonly TurnStep[]): ToolEvidence[] {
  const lines = (pattern: RegExp) =>
    steps
      .filter((s) => s.status === 'done' && pattern.test(s.title))
      .map((s) => `${s.title}: ${s.result ?? ''}`)
      .join('\n')
      .slice(0, 1000) || null
  const ostrovok = lines(/Островк/)
  return [
    ...(ostrovok
      ? [dataset('mediator-ostrovok', 'Островок', 'Места рядом и этажи номеров на странице отеля', ostrovok)]
      : []),
    ...(kind === 'view'
      ? [dataset('mediator-eubucco', 'EUBUCCO', 'Здания и их высота для вида из окна', lines(/EUBUCCO|здани|этаж/i))]
      : [
          dataset(
            'mediator-osm',
            'OpenStreetMap',
            'Места и маршруты рядом с отелем',
            lines(/Ищу|маршрут|Строю/) ?? null,
          ),
        ]),
  ]
}

const outcomeResult = (kind: 'geo' | 'view', outcome: GeoOutcome): ToolResult =>
  toolResultSchema.parse({
    status: 'success',
    summary: outcome.summary.slice(0, 1000),
    data: null,
    evidence: stepEvidence(kind, outcome.steps),
    claims: [],
    calculations: [],
    method: null,
    limitations: LIMITATIONS,
    error: null,
  } satisfies ToolResult)

/** The noise tool's block as it is, with the assistant's own limitation first. */
const noiseResult = (run: ToolResult): ToolResult => ({
  ...run,
  limitations: [LIMITATIONS[0], ...run.limitations],
})

/**
 * The answer of Эвал's steps to the traveller's last message, or `null`. A question about the noise runs the noise
 * tool (the answer is `ruleAnswer`'s, from its claims), about the view the view steps, about the places and the beach
 * the geo steps — each only when it found something to say.
 */
export async function placesAnswer(
  hotel: Hotel,
  dialog: readonly { sender: string; text: string }[],
  { details, models, deadline, signal, onError }: PlacesOptions,
): Promise<PlacesAnswer | null> {
  const messages = dialog.map((m) => ({
    role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
    text: m.text,
  }))
  const text = messages.at(-1)?.text ?? ''
  if (isNoiseQuestion(text)) {
    const run = await runNoiseTool(hotel.id)
    if (run.status === 'error' || run.claims.length === 0) return null
    return { answer: ruleAnswer(text, hotel, undefined, details, null, run).answer, result: noiseResult(run) }
  }
  if (isHotelViewQuestion(text)) {
    const outcome = await viewTurn(hotel, messages, { deadline, signal, details, models, onError })
    return outcome.steps.some((s) => s.status === 'done' && s.title.includes('EUBUCCO'))
      ? { answer: outcome.summary, result: outcomeResult('view', outcome) }
      : null
  }
  if (isHotelGeoQuestion(text)) {
    const outcome = await geoTurn(hotel, messages, { deadline, signal, models, ostrovok: details?.nearby, onError })
    return outcome ? { answer: outcome.summary, result: outcomeResult('geo', outcome) } : null
  }
  return null
}
