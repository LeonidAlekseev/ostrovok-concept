import 'server-only'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { getSecret } from '../secrets'
import { NVIDIA_BASE_URL, NVIDIA_KEY } from './nvidia'

/** The light text tasks: reading the traveller's wish. */
export const ASSISTANT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'
/** The photos of the chat: what is on them, for the search of similar hotels and for the wish. */
export const VISION_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b'

/** `modelId` on the NVIDIA API, or `undefined` without `NVIDIA_API_KEY` (the rules take over). */
async function nvidiaModel(modelId: string): Promise<LanguageModel | undefined> {
  const apiKey = await getSecret(NVIDIA_KEY)
  if (!apiKey) return undefined
  // The API takes `response_format: json_schema`, so the answer follows the schema of `Output.object`.
  return createOpenAICompatible({ name: 'nvidia', baseURL: NVIDIA_BASE_URL, apiKey, supportsStructuredOutputs: true })(
    modelId,
  )
}

/** The assistant's model on the NVIDIA API, or `undefined` without `NVIDIA_API_KEY` (the rules take over). */
export const getAssistantModel = () => nvidiaModel(ASSISTANT_MODEL)

/** The model that sees photos, or `undefined` without `NVIDIA_API_KEY`: Эвал says it could not look at them. */
export const getVisionModel = () => nvidiaModel(VISION_MODEL)
