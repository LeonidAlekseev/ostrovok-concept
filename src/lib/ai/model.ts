import 'server-only'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { getSecret } from '../secrets'
import { NVIDIA_BASE_URL, NVIDIA_KEY } from './nvidia'

/** The light text tasks: reading the traveller's wish. */
export const ASSISTANT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'

/** The assistant's model on the NVIDIA API, or `undefined` without `NVIDIA_API_KEY` (the rules take over). */
export async function getAssistantModel(): Promise<LanguageModel | undefined> {
  const apiKey = await getSecret(NVIDIA_KEY)
  if (!apiKey) return undefined
  // The API takes `response_format: json_schema`, so the answer follows the schema of `Output.object`.
  return createOpenAICompatible({ name: 'nvidia', baseURL: NVIDIA_BASE_URL, apiKey, supportsStructuredOutputs: true })(
    ASSISTANT_MODEL,
  )
}
