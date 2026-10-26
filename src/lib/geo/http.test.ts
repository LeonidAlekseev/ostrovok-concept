import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_AGENT, osmJson, retryAfterSeconds } from './http'
import { RateGate } from './limits'

const overloaded = readFileSync(new URL('./fixtures/overpass-502.txt', import.meta.url), 'utf8')
const budget = () => ({ deadline: Date.now() + 9000 })
const request = (fetch: typeof globalThis.fetch, gate = new RateGate()) =>
  osmJson({ service: 'overpass', url: 'https://overpass.example/api', timeoutMs: 4000, budget: budget(), gate, fetch })

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// assistant-geo, Requirement: Честные ошибки и лимиты OSM
describe('a request to an OSM service', () => {
  it('sends the project User-Agent with the repository, not a personal address', async () => {
    const fetch = vi.fn(async () => Response.json({ elements: [] }))
    expect(await request(fetch)).toEqual({ ok: true, value: { elements: [] } })
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['user-agent']).toBe(USER_AGENT)
    expect(USER_AGENT).toContain('https://github.com/LeonidAlekseev/ostrovok-concept')
    expect(USER_AGENT).not.toMatch(/@/)
  })

  it('is limited by a 429 for its Retry-After, and sends nothing until then', async () => {
    const gate = new RateGate()
    const fetch = vi.fn(
      async () => new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '30' } }),
    )
    expect(await request(fetch, gate)).toMatchObject({
      ok: false,
      reason: 'limited',
      retryAfterS: 30,
      message: 'Сервис мест OpenStreetMap ограничил запросы, подождите 30 с.',
    })
    expect(await request(fetch, gate)).toMatchObject({ reason: 'limited', retryAfterS: 30 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('says it could not check when the server is at capacity', async () => {
    const fetch = vi.fn(async () => new Response(overloaded, { status: 502 }))
    expect(await request(fetch)).toEqual({
      ok: false,
      reason: 'unavailable',
      service: 'overpass',
      message: 'Не удалось проверить: сервис мест OpenStreetMap сейчас недоступен.',
    })
  })

  it('says it could not check after a network error or a body that is not JSON', async () => {
    expect(await request(vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))).toMatchObject({
      reason: 'unavailable',
    })
    expect(await request(vi.fn(async () => new Response('<html>')))).toMatchObject({ reason: 'unavailable' })
  })

  it('stops at its own time', async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        ),
    )
    const result = await osmJson({
      service: 'osrm',
      url: 'https://osrm.example',
      timeoutMs: 50,
      budget: budget(),
      gate: new RateGate(),
      fetch: hanging,
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'timeout',
      message: 'Не удалось проверить: сервис маршрутов OpenStreetMap не ответил вовремя.',
    })
  })

  it('does not start without the time for it', async () => {
    const fetch = vi.fn()
    const result = await osmJson({
      service: 'nominatim',
      url: 'https://nominatim.example',
      timeoutMs: 2500,
      budget: { deadline: Date.now() + 100 },
      gate: new RateGate(),
      fetch,
    })
    expect(result).toMatchObject({ reason: 'timeout' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws when the turn is aborted', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(
      osmJson({
        service: 'osrm',
        url: 'https://osrm.example',
        timeoutMs: 2500,
        budget: { deadline: Date.now() + 9000, signal: controller.signal },
        gate: new RateGate(),
        fetch,
      }),
    ).rejects.toThrow()
  })
})

describe('Retry-After', () => {
  it('reads seconds and dates', () => {
    expect(retryAfterSeconds('12')).toBe(12)
    expect(retryAfterSeconds('0')).toBe(1)
    expect(retryAfterSeconds('Mon, 26 Oct 2026 12:00:30 GMT', Date.parse('2026-10-26T12:00:00Z'))).toBe(30)
    expect(retryAfterSeconds('soon')).toBeUndefined()
    expect(retryAfterSeconds(null)).toBeUndefined()
  })
})
