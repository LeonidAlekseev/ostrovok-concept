import { APICallError } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pacer, withRetry } from './nvidia'

afterEach(() => {
  vi.useRealTimers()
})

const apiError = (statusCode: number, responseHeaders?: Record<string, string>) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'u', requestBodyValues: {}, statusCode, responseHeaders })

describe('pacer', () => {
  it('lets 40 requests a minute through: each next one waits 1.5 s after the previous', async () => {
    vi.useFakeTimers({ now: 0 })
    const sleep = vi.fn(async (ms: number) => void vi.advanceTimersByTime(ms))
    const turn = pacer(40, sleep)
    await turn()
    await turn()
    await turn()
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1500, 1500])
    vi.advanceTimersByTime(5000)
    await turn()
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})

describe('withRetry', () => {
  it('waits and tries again after a 429, so nothing is lost', async () => {
    const sleep = vi.fn(async () => {})
    const call = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(429, { 'retry-after': '20' }))
      .mockResolvedValue('vectors')
    expect(await withRetry(call, { sleep })).toBe('vectors')
    expect(sleep.mock.calls).toEqual([[2000], [20000]])
  })

  it('throws a final error at once and a retryable one after the last try', async () => {
    const sleep = vi.fn(async () => {})
    await expect(withRetry(() => Promise.reject(apiError(401)), { sleep })).rejects.toThrow('HTTP 401')
    expect(sleep).not.toHaveBeenCalled()
    await expect(withRetry(() => Promise.reject(apiError(503)), { sleep, attempts: 3 })).rejects.toThrow('HTTP 503')
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
