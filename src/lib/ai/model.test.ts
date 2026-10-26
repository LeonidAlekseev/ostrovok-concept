import { generateText } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSecret } from '../secrets'
import { TEXT_CHAIN, VISION_CHAIN, getTextModels, getVisionModels } from './model'

vi.mock('../secrets', () => ({ getSecret: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// semantic-search, Requirement: Модели через API NVIDIA
describe('getTextModels', () => {
  it('gives no models without NVIDIA_API_KEY, so the rules answer', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined)
    expect(await getTextModels()).toBeUndefined()
    expect(getSecret).toHaveBeenCalledWith('NVIDIA_API_KEY')
  })

  it('gives the text chain of the NVIDIA API in order, each with its own time, within the 8 s', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-key')
    const models = await getTextModels()
    expect(models?.map((m) => m.id)).toEqual([
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'nvidia/nemotron-3.5-bolt-e4b',
      'minimaxai/minimax-m3.1-flash',
    ])
    models?.forEach((m, i) => {
      expect(m.model).toMatchObject({ modelId: TEXT_CHAIN[i].id, provider: 'nvidia.chat' })
      expect(m.timeoutMs).toBeLessThanOrEqual(8000)
    })
  })
})

// assistant-search, Requirement: Сбой модели фото
describe('getVisionModels', () => {
  it('gives no models without NVIDIA_API_KEY', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined)
    expect(await getVisionModels()).toBeUndefined()
  })

  it('gives the models that see photos with the key, the main one first', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-key')
    const models = await getVisionModels()
    expect(models?.map((m) => m.id)).toEqual(['nvidia/nemotron-3.5-super-vl-120b-a12b', 'minimaxai/minimax-m3.1-flash'])
    expect(models?.[0].model).toMatchObject({ modelId: VISION_CHAIN[0].id, provider: 'nvidia.chat' })
  })
})

describe('the request of a chain model', () => {
  /** The body each model of the vision chain sends for a request with `reasoning: 'none'`, in order. */
  async function bodies() {
    vi.mocked(getSecret).mockResolvedValue('test-key')
    const sent: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_: unknown, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string))
        return Response.json({
          choices: [{ message: { role: 'assistant', content: 'ок' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      }),
    )
    for (const { model } of (await getVisionModels())!)
      await generateText({ model, prompt: 'фото', reasoning: 'none', maxRetries: 0 })
    return sent
  }

  it('turns reasoning off in every model of the vision chain', async () => {
    const [main, spare] = await bodies()
    expect(main).toMatchObject({ model: VISION_CHAIN[0].id, reasoning_effort: 'none' })
    expect(spare).toMatchObject({ model: VISION_CHAIN[1].id, reasoning_effort: 'none' })
  })
})
