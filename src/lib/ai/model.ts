import 'server-only'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import { getSecret } from '../secrets'

export const DEFAULT_MODEL = 'minimax/minimax-m3.1-flash:free'

/** The OpenRouter model of the assistant, or `undefined` without `OPENROUTER_API_KEY` (the rules take over). */
export async function getAssistantModel(): Promise<LanguageModel | undefined> {
  const apiKey = await getSecret('OPENROUTER_API_KEY')
  if (!apiKey) return undefined
  const modelId = (await getSecret('OPENROUTER_MODEL')) || DEFAULT_MODEL
  return createOpenRouter({ apiKey })(modelId)
}
