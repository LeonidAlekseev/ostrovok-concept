import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { after as nextAfter, NextRequest } from 'next/server'
import { demoUser, DEMO_COOKIE, standaloneClient, type DemoAccount, type DemoUser } from './client'
import { standaloneFunctions, type Vectors } from './functions'
import type { Row } from './query'
import { Db, type Actor, type Overlay } from './store'
import { OVERLAY_FIELD, OVERLAY_HEADER, TRAILER, decodeOverlay } from './wire'

/**
 * The server of the standalone demo: the snapshot of data/standalone (scripts/export-standalone.ts), read once an
 * instance, and the rows of the browser that asks (`withStandaloneDb`), so a route sees that browser's chats and
 * answers and gives back what it wrote. Nothing is kept between requests: the browser keeps its own rows.
 */

const DIR = join(process.cwd(), 'data/standalone')

const tables = new Map<string, Row[]>()

function table(name: string): Row[] {
  let rows = tables.get(name)
  if (!rows) {
    try {
      rows = JSON.parse(gunzipSync(readFileSync(join(DIR, 'tables', `${name}.json.gz`))).toString()) as Row[]
    } catch {
      rows = []
    }
    tables.set(name, rows)
  }
  return rows
}

const vectorCache = new Map<string, Vectors | null>()

function vectors(name: string): Vectors | null {
  if (!vectorCache.has(name)) {
    try {
      const { dim } = JSON.parse(readFileSync(join(DIR, 'vectors', `${name}.json`), 'utf8')) as { dim: number }
      const file = readFileSync(join(DIR, 'vectors', `${name}.f32`))
      // A view of the file's bytes needs them aligned to 4; a copy when Node's buffer is not.
      const data =
        file.byteOffset % 4 === 0
          ? new Float32Array(file.buffer, file.byteOffset, file.byteLength / 4)
          : new Float32Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
      vectorCache.set(name, { dim, data })
    } catch {
      vectorCache.set(name, null)
    }
  }
  return vectorCache.get(name) ?? null
}

let calls: Map<string, unknown> | undefined

function recorded(key: string): unknown {
  if (!calls) {
    try {
      const text = gunzipSync(readFileSync(join(DIR, 'rpc.json.gz'))).toString()
      calls = new Map(Object.entries(JSON.parse(text) as Record<string, unknown>))
    } catch (error) {
      console.warn(`standalone: no recorded calls (${String(error).slice(0, 200)})`)
      calls = new Map()
    }
  }
  return calls.get(key)
}

const functions = standaloneFunctions({ recorded, vectors })

let demo: Record<DemoAccount, string> | undefined

/** The demo accounts' ids and names, of the snapshot. */
export function demoAccounts(): Record<DemoAccount, DemoUser> {
  demo ??= JSON.parse(readFileSync(join(DIR, 'demo.json'), 'utf8')) as Record<DemoAccount, string>
  const nameOf = (id: string) => String(table('profiles').find((p) => p.id === id)?.name ?? '')
  return {
    traveller: demoUser(demo.traveller, nameOf(demo.traveller)),
    hotelier: demoUser(demo.hotelier, nameOf(demo.hotelier)),
  }
}

/** The demo user of a cookie's value; `null` for a guest. */
export const userOfCookie = (value: string | undefined): DemoUser | null =>
  value === 'traveller' || value === 'hotelier' ? demoAccounts()[value] : null

interface Context {
  overlay: Overlay
  user: DemoUser | null
  db?: Db
  pending: Promise<unknown>[]
}

const context = new AsyncLocalStorage<Context>()

/** The tables as `actor` sees them: in a route of `withStandaloneDb`, with the asking browser's rows. */
export function serverDb(actor: Actor): Db {
  const ctx = context.getStore()
  if (!ctx) return new Db(table, {}, functions, actor)
  ctx.db ??= new Db(table, ctx.overlay, functions, { userId: null, service: false })
  return ctx.db.as(actor)
}

/** The user of the request: the route's, else the cookie of `next/headers`. */
async function requestUser(): Promise<DemoUser | null> {
  const ctx = context.getStore()
  if (ctx) return ctx.user
  try {
    const { cookies } = await import('next/headers')
    return userOfCookie((await cookies()).get(DEMO_COOKIE)?.value)
  } catch {
    return null
  }
}

/** The anon key's client: no user, the policies applied. */
export const anonStandaloneClient = () =>
  standaloneClient(() => serverDb({ userId: null, service: false }), { user: () => null })

/** The service role's client: the policies skipped. */
export const serviceStandaloneClient = () =>
  standaloneClient(() => serverDb({ userId: null, service: true }), { user: () => null })

/** The client of the request's demo user (the cookie). */
export async function userStandaloneClient() {
  const user = await requestUser()
  return standaloneClient(() => serverDb({ userId: user?.id ?? null, service: false }), { user: () => user })
}

/** `after` of a route of `withStandaloneDb`: its work finishes before the route's changes go back to the browser. */
export function after(task: () => unknown) {
  const ctx = context.getStore()
  if (!ctx) return nextAfter(task)
  ctx.pending.push(
    Promise.resolve()
      .then(task)
      .catch((error: unknown) => console.warn(`standalone: after failed (${String(error).slice(0, 200)})`)),
  )
}

const cookieOf = (request: Request) =>
  /(?:^|;\s*)standalone-demo=([a-z]+)/.exec(request.headers.get('cookie') ?? '')?.[1]

/** The browser's rows of the request, and the request with its own body back. */
async function unwrap(request: NextRequest): Promise<{ overlay: Overlay; request: NextRequest; carried: boolean }> {
  const header = request.headers.get(OVERLAY_HEADER)
  if (header) return { overlay: await decodeOverlay(header), request, carried: true }
  const plain = { overlay: {}, request, carried: false }
  if (request.method === 'GET' || request.method === 'HEAD') return plain
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return plain
  const text = await request.text()
  const again = (body: string) =>
    new NextRequest(request.url, { method: request.method, headers: request.headers, body, signal: request.signal })
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && OVERLAY_FIELD in parsed)
      return {
        overlay: (parsed[OVERLAY_FIELD] as Overlay) ?? {},
        request: again(String(parsed.body ?? '')),
        carried: true,
      }
  } catch {}
  return { overlay: {}, request: again(text), carried: false }
}

type Handler<R, C> = (request: R, context: C) => Promise<Response> | Response

/**
 * A route that sees the asking browser's rows: they come in its body (or a header), and what the route and its
 * `after` work wrote goes back after the response's own body, behind `TRAILER` — the browser's fetch takes it off
 * (src/lib/standalone/browser.ts). A request without the rows (a client of the public API) is answered as before.
 */
export function withStandaloneDb<R extends Request, C>(
  handler: Handler<R, C>,
): (request: R, context?: C) => Promise<Response> {
  return async (incoming, routeContext) => {
    const unwrapped = await unwrap(incoming as unknown as NextRequest)
    const { overlay, carried } = unwrapped
    const request = unwrapped.request as unknown as R
    const ctx: Context = { overlay, user: userOfCookie(cookieOf(incoming)), pending: [] }
    const response = await context.run(ctx, () => handler(request, routeContext as C))
    const finish = async () => {
      for (let i = 0; i < ctx.pending.length; i += 1) await ctx.pending[i]
      return ctx.db?.changes ?? {}
    }
    // A client of the public API (not the demo's browser) gets the response as it is: nothing is kept for it.
    if (!carried) {
      await finish()
      return response
    }
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.set(OVERLAY_HEADER, '1')
    const source = response.body
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      // In the request's context: the body of a stream (Эвал's answer) reads and writes the tables while it is read.
      start: (controller) =>
        context.run(ctx, async () => {
          if (source) {
            const reader = source.getReader()
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              controller.enqueue(value)
            }
          }
          const changes = await finish()
          controller.enqueue(encoder.encode(TRAILER + JSON.stringify(changes)))
          controller.close()
        }),
    })
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }
}
