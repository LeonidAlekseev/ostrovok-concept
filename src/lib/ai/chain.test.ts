import { APICallError, type LanguageModel } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { firstAnswer, type ModelLink } from './chain'

const link = (id: string, timeoutMs = 1000): ModelLink => ({ id, timeoutMs, model: id as unknown as LanguageModel })
const httpError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'x', requestBodyValues: {}, statusCode })
/** Answers when the signal aborts: a stalled model. */
const stall = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))

afterEach(() => {
  vi.useRealTimers()
})

describe('firstAnswer', () => {
  it('gives the first model’s answer and asks no other', async () => {
    const call = vi.fn(async (model: LanguageModel) => `от ${String(model)}`)
    const result = await firstAnswer([link('a'), link('b')], call, { deadline: Date.now() + 5000 })
    expect(result).toEqual({ ok: true, value: 'от a', id: 'a', failed: [] })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('goes to the next model after an error or a stall, with the same request', async () => {
    const seen: string[] = []
    const result = await firstAnswer(
      [link('a'), link('b', 20), link('c')],
      async (model, signal) => {
        seen.push(String(model))
        if (String(model) === 'a') throw httpError(500)
        if (String(model) === 'b') return stall(signal)
        return 'ok'
      },
      { deadline: Date.now() + 5000 },
    )
    expect(result).toEqual({ ok: true, value: 'ok', id: 'c', failed: ['a', 'b'] })
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('never goes past the deadline: the last model gets what is left, or is not asked', async () => {
    const times: number[] = []
    const start = Date.now()
    const result = await firstAnswer(
      [link('a', 60), link('b', 5000), link('c', 5000)],
      async (_, signal) => {
        times.push(Date.now() - start)
        return stall(signal)
      },
      { deadline: start + 150, minMs: 50 },
    )
    expect(result).toEqual({ ok: false, failed: ['a', 'b'], limited: false })
    expect(Date.now() - start).toBeLessThan(250)
    expect(times).toHaveLength(2)
  })

  it('is limited only when every model answered 429', async () => {
    const deadline = Date.now() + 5000
    const all = await firstAnswer([link('a'), link('b')], async () => Promise.reject(httpError(429)), { deadline })
    expect(all).toEqual({ ok: false, failed: ['a', 'b'], limited: true })
    const some = await firstAnswer(
      [link('a'), link('b')],
      async (model) => Promise.reject(httpError(String(model) === 'a' ? 429 : 500)),
      { deadline },
    )
    expect(some).toMatchObject({ ok: false, limited: false })
  })

  it('throws when the request is aborted', async () => {
    const controller = new AbortController()
    const call = vi.fn(async () => {
      controller.abort()
      throw new Error('aborted')
    })
    await expect(
      firstAnswer([link('a'), link('b')], call, { deadline: Date.now() + 5000, signal: controller.signal }),
    ).rejects.toThrow('aborted')
    expect(call).toHaveBeenCalledTimes(1)
  })
})
