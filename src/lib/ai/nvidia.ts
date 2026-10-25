import { APICallError } from 'ai'

/**
 * The NVIDIA API (build.nvidia.com): the assistant's model, the embeddings and the reranker. One key,
 * `NVIDIA_API_KEY`, and 40 requests a minute. No `server-only`: `npm run db:embed` and the quality check use it too,
 * the caller brings the key.
 */

export const NVIDIA_KEY = 'NVIDIA_API_KEY'
/** The OpenAI-compatible API: chat completions and embeddings. */
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

/** POSTs `body` as JSON and gives the parsed answer; a failed status throws an `APICallError` (429 and 5xx retryable). */
export async function postNvidia(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  { abortSignal, headers }: { abortSignal?: AbortSignal; headers?: Record<string, string | undefined> } = {},
): Promise<{ value: unknown; responseHeaders: Record<string, string> }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...Object.fromEntries(Object.entries(headers ?? {}).filter(([, value]) => value !== undefined)),
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  })
  const responseHeaders = Object.fromEntries(response.headers)
  const text = await response.text()
  // 408, 409, 429 and 5xx are retryable: `maxRetries` of the SDK and the scripts' own loops repeat them.
  if (!response.ok)
    throw new APICallError({
      message: `NVIDIA API: HTTP ${response.status}`,
      url,
      requestBodyValues: { model: body.model },
      statusCode: response.status,
      responseHeaders,
      responseBody: text.slice(0, 500),
    })
  return { value: JSON.parse(text), responseHeaders }
}

/** The key's limit: requests a minute. */
export const NVIDIA_RPM = 40

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** For the scripts: each call of the returned gate waits its turn, so no more than `rpm` requests start a minute. */
export function pacer(rpm = NVIDIA_RPM, sleep = pause): () => Promise<void> {
  const gap = 60_000 / rpm
  let next = 0
  return async () => {
    const now = Date.now()
    const start = Math.max(next, now)
    next = start + gap
    if (start > now) await sleep(start - now)
  }
}

/**
 * For the scripts: `call` again after a retryable error (429, 5xx, the network) — after `Retry-After` when the API
 * gives it, otherwise 2, 4, 8… s; the last error is thrown after `attempts` tries.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  {
    attempts = 6,
    sleep = pause,
    onRetry,
  }: { attempts?: number; sleep?: typeof pause; onRetry?: (message: string) => void } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call()
    } catch (error) {
      const retryable = !APICallError.isInstance(error) || error.isRetryable
      if (!retryable || attempt === attempts) throw error
      const retryAfter = APICallError.isInstance(error) ? Number(error.responseHeaders?.['retry-after']) : NaN
      const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
      onRetry?.(`retry ${attempt}/${attempts - 1} in ${ms / 1000} s (${(error as Error).message.slice(0, 120)})`)
      await sleep(ms)
    }
  }
}
