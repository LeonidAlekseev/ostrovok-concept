import { APICallError, type LanguageModel } from 'ai'

/**
 * A chain of models: the first that answers gives the answer. No `server-only`: the models come from
 * src/lib/ai/model.ts, the tests bring their own.
 */

/** A model of a chain with the time it gets. */
export interface ModelLink {
  id: string
  model: LanguageModel
  timeoutMs: number
}

export type ChainResult<T> =
  | { ok: true; value: T; id: string; failed: string[] }
  /** `limited`: every model asked answered 429. */
  | { ok: false; failed: string[]; limited: boolean }

/** A model is not asked with less than this left of the chain's time: it would not answer anyway. */
export const MIN_LINK_MS = 1000

/**
 * Asks the models of `links` in turn, each with the same request (`call`) and its own timeout, never past
 * `deadline`; an error, a timeout or an answer `call` rejects goes to the next one. The abort of `signal` throws.
 */
export async function firstAnswer<T>(
  links: readonly ModelLink[],
  call: (model: LanguageModel, signal: AbortSignal) => Promise<T>,
  {
    deadline,
    signal,
    minMs = MIN_LINK_MS,
    onError,
  }: { deadline: number; signal?: AbortSignal; minMs?: number; onError?: (id: string, error: unknown) => void },
): Promise<ChainResult<T>> {
  const failed: string[] = []
  let limited = true
  for (const { id, model, timeoutMs } of links) {
    const left = deadline - Date.now()
    if (left < minMs) break
    const timeout = AbortSignal.timeout(Math.min(timeoutMs, left))
    try {
      const value = await call(model, signal ? AbortSignal.any([signal, timeout]) : timeout)
      return { ok: true, value, id, failed }
    } catch (error) {
      if (signal?.aborted) throw error
      onError?.(id, error)
      failed.push(id)
      if (!(APICallError.isInstance(error) && error.statusCode === 429)) limited = false
    }
  }
  return { ok: false, failed, limited: failed.length > 0 && limited }
}
