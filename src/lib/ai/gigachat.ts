import 'server-only'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { APICallError } from 'ai'
import { Agent, fetch as undiciFetch } from 'undici'

/**
 * GigaChat (Sber): the first model of the text chain. The API is OpenAI-like, with three differences this file
 * hides from the AI SDK: the access token comes from an OAuth call and lives 30 min, the certificates are signed by
 * the Russian Trusted Root CA, and the model takes `functions`/`function_call` (the answer with an object in
 * `arguments`), not `tools` and `response_format: json_schema`.
 */

export const GIGACHAT_KEY = 'GIGACHAT_AUTH_KEY'
export const GIGACHAT_BASE_URL = 'https://api.giga.chat/v1'
/** The name of the biggest model of the API: `GET /v1/models` has no "Ultra 3.5". */
export const GIGACHAT_MODEL = 'GigaChat-3-Ultra'
const OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const CA_FILE = 'config/certs/russian_trusted_root_ca.pem'

/** The token is renewed this long before it ends, so a request never leaves with a token about to die. */
const TOKEN_MARGIN_MS = 60_000
/** The lifetime of a token that comes without `expires_at`: the API gives 30 min. */
const TOKEN_FALLBACK_MS = 25 * 60_000

// Only the requests to Sber get this CA; the TLS check of the others stays as it is. next.config.ts traces the file
// into every server function, the path hides from Turbopack as in src/lib/secrets.ts.
let agent: Promise<Agent> | undefined
const getAgent = () =>
  (agent ??= readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), CA_FILE)).then(
    (ca) => new Agent({ connect: { ca } }),
    (error: unknown) => {
      agent = undefined
      throw error
    },
  ))

type Token = { value: string; expiresAt: number }
let cached: Token | undefined
let pending: Promise<Token> | undefined

async function requestToken(authKey: string): Promise<Token> {
  const response = await undiciFetch(OAUTH_URL, {
    method: 'POST',
    dispatcher: await getAgent(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      rquid: randomUUID(),
      authorization: `Basic ${authKey}`,
    },
    body: 'scope=GIGACHAT_API_PERS',
  })
  const text = await response.text()
  if (!response.ok)
    throw new APICallError({
      message: `GigaChat OAuth: HTTP ${response.status}`,
      url: OAUTH_URL,
      requestBodyValues: {},
      statusCode: response.status,
      responseBody: text.slice(0, 200),
    })
  const { access_token, expires_at } = JSON.parse(text) as { access_token: string; expires_at?: number }
  return { value: access_token, expiresAt: expires_at ?? Date.now() + TOKEN_FALLBACK_MS }
}

/** The token of the key: the cached one while it lasts, otherwise a new one (a burst of requests asks once). */
async function getToken(authKey: string, force: boolean): Promise<string> {
  if (force) cached = undefined
  if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cached.value
  // No signal: the callers share the promise, the timeout of one must not fail the others.
  pending ??= requestToken(authKey)
    .then((token) => (cached = token))
    .finally(() => (pending = undefined))
  return (await pending).value
}

/** For the tests: forget the token and the agent. */
export function resetGigaChat() {
  cached = pending = agent = undefined
}

type Json = Record<string, unknown>

/**
 * The request of the AI SDK in the words of GigaChat. `tools` become `functions`; a schema of `response_format` also
 * becomes a function the model must call, so the answer follows the schema. Returns the body and whether the
 * object of the function is the answer itself.
 */
export function toGigaChatRequest(body: Json): { body: Json; structured: boolean } {
  // `reasoning_effort` (the SDK's `reasoning: 'none'`) is a 422 for GigaChat: it does not reason on request.
  const { tools, tool_choice, response_format, reasoning_effort: _, ...rest } = body
  const functions: unknown[] = Array.isArray(tools) ? tools.map((tool) => (tool as { function: unknown }).function) : []
  const schema = (response_format as { json_schema?: { schema?: Json } } | undefined)?.json_schema?.schema
  if (schema) {
    functions.push({ name: 'answer', description: 'Ответ по схеме', parameters: schema })
    return { body: { ...rest, functions, function_call: { name: 'answer' } }, structured: true }
  }
  if (!functions.length)
    return { body: { ...rest, ...(response_format ? { response_format } : {}) }, structured: false }
  const forced =
    tool_choice === 'required' && functions.length === 1 ? (functions[0] as { name: string }).name : undefined
  const choice = tool_choice as { function?: { name: string } } | string | undefined
  return {
    body: {
      ...rest,
      functions,
      function_call:
        forced !== undefined
          ? { name: forced }
          : typeof choice === 'object' && choice.function
            ? { name: choice.function.name }
            : choice === 'none'
              ? 'none'
              : 'auto',
    },
    structured: false,
  }
}

/** The answer of GigaChat in the words of the AI SDK: a function call becomes a tool call, or the JSON text of the object. */
export function fromGigaChatResponse(body: Json, structured: boolean): Json {
  const choices = body.choices
  if (!Array.isArray(choices)) return body
  return {
    ...body,
    choices: choices.map((choice: { message?: Json; finish_reason?: string }) => {
      const call = choice.message?.function_call as { id?: string; name: string; arguments: unknown } | undefined
      if (!call) return choice
      const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? {})
      const { function_call: _, ...message } = choice.message ?? {}
      return structured
        ? { ...choice, message: { ...message, content: args }, finish_reason: 'stop' }
        : {
            ...choice,
            message: {
              ...message,
              tool_calls: [
                { id: call.id ?? randomUUID(), type: 'function', function: { name: call.name, arguments: args } },
              ],
            },
            finish_reason: 'tool_calls',
          }
    }),
  }
}

/**
 * The `fetch` of the GigaChat provider: the TLS of the Russian Trusted Root CA, the bearer token (renewed once
 * after a 401), the adapter of the request and the answer. Streams are not adapted: the assistant asks the model once.
 */
export function gigachatFetch(authKey: string): typeof globalThis.fetch {
  return async (input, init) => {
    const { body, structured } = toGigaChatRequest(JSON.parse(String(init?.body ?? '{}')) as Json)
    const send = async (force: boolean) =>
      undiciFetch(String(input), {
        method: 'POST',
        dispatcher: await getAgent(),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${await getToken(authKey, force)}`,
        },
        body: JSON.stringify(body),
        signal: init?.signal ?? undefined,
      })
    let response = await send(false)
    if (response.status === 401) {
      await response.body?.cancel()
      response = await send(true)
    }
    if (!response.ok) return response as unknown as Response
    const adapted = fromGigaChatResponse((await response.json()) as Json, structured)
    return new Response(JSON.stringify(adapted), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    })
  }
}
