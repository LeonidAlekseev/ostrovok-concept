import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSecret } from '../secrets'
import { ASSISTANT_MODEL, getAssistantModel } from './model'

vi.mock('../secrets', () => ({ getSecret: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getAssistantModel', () => {
  it('gives no model without NVIDIA_API_KEY, so the rules answer', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined)
    expect(await getAssistantModel()).toBeUndefined()
    expect(getSecret).toHaveBeenCalledWith('NVIDIA_API_KEY')
  })

  it('gives the light model of the NVIDIA API with the key', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-key')
    const model = await getAssistantModel()
    expect(model).toMatchObject({ modelId: ASSISTANT_MODEL, provider: 'nvidia.chat' })
  })
})
