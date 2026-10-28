import { generateText, Output, tool } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const undici = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('undici', () => ({ Agent: class {}, fetch: undici.fetch }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => 'pem') }))

import { GIGACHAT_MODEL, fromGigaChatResponse, gigachatFetch, resetGigaChat, toGigaChatRequest } from './gigachat'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const token = (expiresAt: number, value = 'tok') => json({ access_token: value, expires_at: expiresAt })
const completion = (message: object, finish_reason: string) =>
  json({
    id: 'x',
    created: 1,
    model: GIGACHAT_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content: '', ...message }, finish_reason }],
  })
const call = (name: string, args: object) => ({ function_call: { id: 'c1', name, arguments: args } })

const provider = () =>
  createOpenAICompatible({
    name: 'gigachat',
    baseURL: 'https://api.giga.chat/v1',
    fetch: gigachatFetch('KEY'),
    supportsStructuredOutputs: true,
  })

beforeEach(() => {
  undici.fetch.mockReset()
  resetGigaChat()
})

// semantic-search, Requirement: Модели через API NVIDIA
describe('GigaChat request adapter', () => {
  it('turns tools into functions and a forced single tool into a named function_call', () => {
    const { body, structured } = toGigaChatRequest({
      model: 'm',
      messages: [],
      tools: [{ type: 'function', function: { name: 'plan', parameters: { type: 'object' } } }],
      tool_choice: 'required',
    })
    expect(body).toEqual({
      model: 'm',
      messages: [],
      functions: [{ name: 'plan', parameters: { type: 'object' } }],
      function_call: { name: 'plan' },
    })
    expect(structured).toBe(false)
  })

  it('turns the schema of response_format into a function the model must call', () => {
    const schema = { type: 'object', properties: { city: { type: 'string' } } }
    const { body, structured } = toGigaChatRequest({
      messages: [],
      response_format: { type: 'json_schema', json_schema: { name: 'response', schema } },
    })
    expect(body).toMatchObject({
      functions: [{ name: 'answer', parameters: schema }],
      function_call: { name: 'answer' },
    })
    expect(body).not.toHaveProperty('response_format')
    expect(structured).toBe(true)
  })

  it('drops reasoning_effort, which GigaChat answers with 422', () => {
    expect(toGigaChatRequest({ messages: [], reasoning_effort: 'none' }).body).toEqual({ messages: [] })
  })

  it('leaves a plain request alone', () => {
    expect(toGigaChatRequest({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })).toEqual({
      body: { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      structured: false,
    })
  })
})

describe('GigaChat response adapter', () => {
  it('makes a function call the JSON text of the answer, or a tool call', () => {
    const body = { choices: [{ message: call('answer', { city: 'Валенсия' }), finish_reason: 'function_call' }] }
    const [structured] = (fromGigaChatResponse(body, true) as { choices: { message: object; finish_reason: string }[] })
      .choices
    expect(structured).toMatchObject({ message: { content: '{"city":"Валенсия"}' }, finish_reason: 'stop' })
    const [tool] = (fromGigaChatResponse(body, false) as { choices: { message: object; finish_reason: string }[] })
      .choices
    expect(tool).toMatchObject({
      message: {
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'answer', arguments: '{"city":"Валенсия"}' } }],
      },
      finish_reason: 'tool_calls',
    })
  })

  it('keeps an answer without a function call as it is, so the schema check fails and the chain goes on', () => {
    const body = { choices: [{ message: { content: 'text' }, finish_reason: 'stop' }] }
    expect(fromGigaChatResponse(body, true)).toEqual(body)
  })
})

describe('GigaChat through the AI SDK', () => {
  it('reads Output.object and a required tool call, with one token for both and the basic key for the token', async () => {
    undici.fetch.mockImplementation(async (url: string) => {
      if (url.includes('/oauth')) return token(Date.now() + 30 * 60_000)
      return undici.fetch.mock.calls.length === 2
        ? completion(call('answer', { city: 'Валенсия' }), 'function_call')
        : completion(call('plan', { query: 'тихо' }), 'function_call')
    })
    const model = provider()(GIGACHAT_MODEL)
    const { output } = await generateText({
      model,
      prompt: 'p',
      output: Output.object({ schema: z.object({ city: z.string() }) }),
    })
    expect(output).toEqual({ city: 'Валенсия' })
    const { toolCalls } = await generateText({
      model,
      prompt: 'p',
      tools: { plan: tool({ description: 'd', inputSchema: z.object({ query: z.string() }) }) },
      toolChoice: 'required',
    })
    expect(toolCalls[0]).toMatchObject({ toolName: 'plan', input: { query: 'тихо' } })
    const urls = undici.fetch.mock.calls.map(([url]) => url)
    expect(urls.filter((u) => u.includes('/oauth'))).toHaveLength(1)
    const oauth = undici.fetch.mock.calls[0][1]
    expect(oauth.headers.authorization).toBe('Basic KEY')
    expect(oauth.headers.rquid).toMatch(/^[0-9a-f-]{36}$/)
    expect(oauth.body).toBe('scope=GIGACHAT_API_PERS')
    expect(undici.fetch.mock.calls[1][1].headers.authorization).toBe('Bearer tok')
  })

  it('asks a new token a minute before the old one ends', async () => {
    let issued = 0
    undici.fetch.mockImplementation(async (url: string) =>
      url.includes('/oauth') ? token(Date.now() + 30_000, `t${++issued}`) : completion({ content: 'ok' }, 'stop'),
    )
    const model = provider()(GIGACHAT_MODEL)
    await generateText({ model, prompt: 'p' })
    await generateText({ model, prompt: 'p' })
    expect(issued).toBe(2)
  })

  it('renews the token once after a 401', async () => {
    let issued = 0
    undici.fetch.mockImplementation(async (url: string, init: { headers: Record<string, string> }) => {
      if (url.includes('/oauth')) return token(Date.now() + 30 * 60_000, `t${++issued}`)
      return init.headers.authorization === 'Bearer t2'
        ? completion({ content: 'ok' }, 'stop')
        : json({ status: 401 }, 401)
    })
    const { text } = await generateText({ model: provider()(GIGACHAT_MODEL), prompt: 'p' })
    expect(text).toBe('ok')
    expect(issued).toBe(2)
  })

  it('throws an API error on 429, so the chain goes to the next model', async () => {
    undici.fetch.mockImplementation(async (url: string) =>
      url.includes('/oauth')
        ? token(Date.now() + 30 * 60_000)
        : json({ status: 429, message: 'Too Many Requests' }, 429),
    )
    await expect(generateText({ model: provider()(GIGACHAT_MODEL), prompt: 'p', maxRetries: 0 })).rejects.toMatchObject(
      {
        statusCode: 429,
      },
    )
  })

  it('fails the schema when the model answers with text, so the chain goes on', async () => {
    undici.fetch.mockImplementation(async (url: string) =>
      url.includes('/oauth') ? token(Date.now() + 30 * 60_000) : completion({ content: 'Вот отели…' }, 'stop'),
    )
    await expect(
      generateText({
        model: provider()(GIGACHAT_MODEL),
        prompt: 'p',
        output: Output.object({ schema: z.object({ city: z.string() }) }),
      }),
    ).rejects.toThrow()
  })
})
