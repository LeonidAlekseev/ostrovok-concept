import 'server-only'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getSecret } from '../secrets'
import type { ModelLink } from './chain'
import { GIGACHAT_BASE_URL, GIGACHAT_KEY, GIGACHAT_MODEL, gigachatFetch } from './gigachat'
import { NVIDIA_BASE_URL, NVIDIA_KEY } from './nvidia'

/** A model of a chain: its id on its API and the time it gets. */
export interface ChainModel {
  id: string
  timeoutMs: number
}

/** GigaChat Ultra, the first of the text chain; the rest of the chain takes over when it fails or stalls. */
export const GIGACHAT_LINK: ChainModel = { id: `gigachat/${GIGACHAT_MODEL}`, timeoutMs: 4500 }

/**
 * The text tasks after GigaChat: reading the traveller's wish, the answers about a hotel, the intent of the photos.
 * The wish is read in about 1 s by `lightning`, 2–2.5 s by `bolt`, 2–4.5 s by `minimax-m3.1-flash`; the next one is
 * asked when the one before failed or stalled, all within the route's 9 s.
 */
export const NVIDIA_TEXT_CHAIN: readonly ChainModel[] = [
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', timeoutMs: 3500 },
  { id: 'nvidia/nemotron-3.5-bolt-e4b', timeoutMs: 3500 },
  { id: 'minimaxai/minimax-m3.1-flash', timeoutMs: 5000 },
]

/** The text chain in order: GigaChat Ultra (with `GIGACHAT_AUTH_KEY`), then the models of the NVIDIA API (with `NVIDIA_API_KEY`). */
export const TEXT_CHAIN: readonly ChainModel[] = [GIGACHAT_LINK, ...NVIDIA_TEXT_CHAIN]

/**
 * The model of `TEXT_CHAIN` asked first for Эвал's remark over the facts of a geo answer (src/lib/ai/geoRemark.ts):
 * in the live check its sentences kept to the facts and answered in 0.3–0.5 s, those of `lightning` drifted to
 * made-up advice; the rest of the chain follows.
 */
export const REMARK_MODEL_ID = 'nvidia/nemotron-3.5-bolt-e4b'

/**
 * The photos of the chat: what is on them, for the search of similar hotels and for the wish. The first answers in
 * 1–12 s and now and then 500; `minimax-m3.1-flash` in 3–12 s and takes what the window has left.
 */
export const VISION_CHAIN: readonly ChainModel[] = [
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', timeoutMs: 10_000 },
  { id: 'minimaxai/minimax-m3.1-flash', timeoutMs: 12_000 },
]

/** The models of `chain` on the NVIDIA API, or `undefined` without `NVIDIA_API_KEY` (the rules take over). */
async function nvidiaModels(chain: readonly ChainModel[]): Promise<ModelLink[] | undefined> {
  const apiKey = await getSecret(NVIDIA_KEY)
  if (!apiKey) return undefined
  // The API takes `response_format: json_schema`, so the answer follows the schema of `Output.object`.
  const provider = createOpenAICompatible({
    name: 'nvidia',
    baseURL: NVIDIA_BASE_URL,
    apiKey,
    supportsStructuredOutputs: true,
  })
  return chain.map(({ id, timeoutMs }) => ({ id, timeoutMs, model: provider(id) }))
}

/** GigaChat Ultra, or `undefined` without `GIGACHAT_AUTH_KEY`. */
async function gigachatModels(): Promise<ModelLink[] | undefined> {
  const authKey = await getSecret(GIGACHAT_KEY)
  if (!authKey) return undefined
  // No `supportsStructuredOutputs`: the adapter of the `fetch` turns the schema into a function call either way.
  const provider = createOpenAICompatible({
    name: 'gigachat',
    baseURL: GIGACHAT_BASE_URL,
    fetch: gigachatFetch(authKey),
    supportsStructuredOutputs: true,
  })
  return [{ ...GIGACHAT_LINK, model: provider(GIGACHAT_MODEL) }]
}

/**
 * The assistant's text models, in order, or `undefined` without both keys (the rules take over). The adapter
 * of the GigaChat can fail on a schema or a tool the model does not follow: the call then fails and the chain goes on.
 */
export async function getTextModels(): Promise<ModelLink[] | undefined> {
  const [gigachat, nvidia] = await Promise.all([gigachatModels(), nvidiaModels(NVIDIA_TEXT_CHAIN)])
  const links = [...(gigachat ?? []), ...(nvidia ?? [])]
  return links.length ? links : undefined
}

/** The models that see photos, in order, or `undefined` without `NVIDIA_API_KEY`: Эвал says it could not look. */
export const getVisionModels = () => nvidiaModels(VISION_CHAIN)
