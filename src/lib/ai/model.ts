import 'server-only'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { getSecret } from '../secrets'
import type { ModelLink } from './chain'
import { NVIDIA_BASE_URL, NVIDIA_KEY } from './nvidia'

/** A model of a chain: its id on the NVIDIA API and the time it gets. */
export interface ChainModel {
  id: string
  timeoutMs: number
  /** The model answers 400 to `reasoning_effort`: the request goes without it. */
  noReasoning?: true
}

/** Drops `reasoning_effort` from the requests: `provider-default` sends none. */
const withoutReasoning: LanguageModelMiddleware = {
  transformParams: async ({ params }) => ({ ...params, reasoning: 'provider-default' }),
}

/**
 * The text tasks: reading the traveller's wish, the answers about a hotel, the intent of the photos. The wish is read
 * in about 1 s by `lightning`, 2–2.5 s by `bolt`, 2–4.5 s by `minimax-m3.1-flash`; the next one is asked when the one
 * before failed or stalled, all within the route's 8 s.
 */
export const TEXT_CHAIN: readonly ChainModel[] = [
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', timeoutMs: 2500 },
  { id: 'nvidia/nemotron-3.5-bolt-e4b', timeoutMs: 3500 },
  { id: 'minimaxai/minimax-m3.1-flash', timeoutMs: 5000 },
]

/**
 * The photos of the chat: what is on them, for the search of similar hotels and for the wish. The first answers in
 * 1–12 s and now and then 500; `minimax-m3.1-flash` in 3–12 s; `llama-3.2-11b-vision` takes no `reasoning_effort`.
 */
export const VISION_CHAIN: readonly ChainModel[] = [
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', timeoutMs: 10_000 },
  { id: 'minimaxai/minimax-m3.1-flash', timeoutMs: 10_000 },
  { id: 'meta/llama-3.2-11b-vision-instruct', timeoutMs: 10_000, noReasoning: true },
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
  return chain.map(({ id, timeoutMs, noReasoning }) => ({
    id,
    timeoutMs,
    model: noReasoning ? wrapLanguageModel({ model: provider(id), middleware: withoutReasoning }) : provider(id),
  }))
}

/** The assistant's text models, in order, or `undefined` without `NVIDIA_API_KEY` (the rules take over). */
export const getTextModels = () => nvidiaModels(TEXT_CHAIN)

/** The models that see photos, in order, or `undefined` without `NVIDIA_API_KEY`: Эвал says it could not look. */
export const getVisionModels = () => nvidiaModels(VISION_CHAIN)
