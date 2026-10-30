import base from '../../../data/standalone/browser.json'
import {
  demoUser,
  DEMO_COOKIE,
  standaloneClient,
  type DemoAccount,
  type DemoUser,
  type StandaloneClient,
} from './client'
import { standaloneFunctions } from './functions'
import type { Row } from './query'
import { Db, type Overlay } from './store'
import { OVERLAY_FIELD, OVERLAY_HEADER, TRAILER, encodeOverlay } from './wire'

/**
 * The browser of the standalone demo: the demo accounts' chats of the snapshot (data/standalone/browser.json) under
 * the rows this browser wrote, kept in `localStorage` (`STORAGE_KEY`). The other tabs see a write by the `storage`
 * event, this tab by the `Db`'s own events (and a poll, in case an event was missed). Every request of the site to
 * its API carries these rows and takes back what the route wrote (`installFetch`).
 */

const STORAGE_KEY = 'standalone-db-v1'
const POLL_MS = 3000
/** A header of a GET carries the rows only up to this size; the vectors of the chunks never. */
const HEADER_LIMIT = 6000

const snapshot = base as unknown as {
  accounts: Record<DemoAccount, { id: string; name: string }>
  tables: Record<string, Row[]>
}

const readOverlay = (): Overlay => {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Overlay) ?? {}
  } catch {
    return {}
  }
}

const cookieAccount = (): DemoAccount | null => {
  if (typeof document === 'undefined') return null
  const value = new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=([a-z]+)`).exec(document.cookie)?.[1]
  return value === 'traveller' || value === 'hotelier' ? value : null
}

export const demoUserOf = (account: DemoAccount | null): DemoUser | null =>
  account ? demoUser(snapshot.accounts[account].id, snapshot.accounts[account].name) : null

let db: Db | undefined
let saved = ''
let account: DemoAccount | null = null
const authListeners = new Set<() => void>()

const functions = standaloneFunctions({})

function save() {
  if (!db) return
  const text = JSON.stringify(db.overlay)
  if (text === saved) return
  saved = text
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch (error) {
    console.warn(`standalone: the browser's rows are not saved (${String(error).slice(0, 200)})`)
  }
}

/** Another tab's rows: the ones that changed are applied with their events. */
function syncFrom(text: string | null) {
  if (!db || text === null || text === saved) return
  saved = text
  let next: Overlay
  try {
    next = JSON.parse(text) as Overlay
  } catch {
    return
  }
  const changed: Overlay = {}
  for (const table of new Set([...Object.keys(next), ...Object.keys(db.overlay)])) {
    const now = next[table] ?? {}
    const was = db.overlay[table] ?? {}
    for (const key of new Set([...Object.keys(now), ...Object.keys(was)])) {
      if (JSON.stringify(now[key]) !== JSON.stringify(was[key])) (changed[table] ??= {})[key] = now[key] ?? null
    }
  }
  db.apply(changed)
}

/** Who the page's tables answer to: changed in place when the demo account changes. */
const actor = { userId: null as string | null, service: false }

function checkAccount() {
  const next = cookieAccount()
  if (next === account) return
  account = next
  actor.userId = demoUserOf(account)?.id ?? null
  for (const listener of authListeners) listener()
}

/** The page's tables (created on the first call, in the browser only). */
export function browserDb(): Db {
  if (!db) {
    account = cookieAccount()
    actor.userId = demoUserOf(account)?.id ?? null
    saved = typeof localStorage === 'undefined' ? '' : (localStorage.getItem(STORAGE_KEY) ?? '')
    db = new Db(
      (table) => snapshot.tables[table] ?? [],
      typeof localStorage === 'undefined' ? {} : readOverlay(),
      functions,
      actor,
    )
    db.subscribe(() => queueMicrotask(save))
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) syncFrom(event.newValue)
        if (event.key === null) syncFrom(localStorage.getItem(STORAGE_KEY))
      })
      setInterval(() => {
        syncFrom(localStorage.getItem(STORAGE_KEY))
        checkAccount()
      }, POLL_MS)
      installFetch()
    }
  }
  return db
}

let client: StandaloneClient | undefined

/** The browser's client of the demo. */
export function browserClient(): StandaloneClient {
  client ??= standaloneClient(browserDb, {
    user: () => {
      browserDb()
      // A server action may have set the cookie since (the demo sign-in).
      checkAccount()
      return demoUserOf(account)
    },
    signOut: () => {
      document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`
      checkAccount()
    },
    onChange: (listener) => {
      authListeners.add(listener)
      return () => authListeners.delete(listener)
    },
  })
  return client
}

/** Signs in to a demo account in this browser (the server's action sets the same cookie for its pages). */
export function signInDemoHere(next: DemoAccount) {
  document.cookie = `${DEMO_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
  checkAccount()
}

/** Re-reads the cookie: a server action may have changed it. */
export const refreshDemoAccount = () => checkAccount()

// ---------------------------------------------------------------- the requests

const marker = new TextEncoder().encode(TRAILER)

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/** How many bytes at the end of `buffer` begin the marker (kept until the next chunk tells). */
function partialTail(buffer: Uint8Array): number {
  for (let n = Math.min(marker.length - 1, buffer.length); n > 0; n -= 1) {
    let match = true
    for (let j = 0; j < n; j += 1)
      if (buffer[buffer.length - n + j] !== marker[j]) {
        match = false
        break
      }
    if (match) return n
  }
  return 0
}

/** The response's own body; the route's changes behind the marker are applied to the page's tables. */
function untrail(response: Response): Response {
  if (!response.body || response.headers.get(OVERLAY_HEADER) !== '1') return response
  let held = new Uint8Array(0)
  let trailer: Uint8Array | null = null
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (trailer) {
          trailer = concat(trailer, chunk)
          return
        }
        const buffer = concat(held, chunk)
        const at = indexOf(buffer, marker)
        if (at >= 0) {
          if (at > 0) controller.enqueue(buffer.slice(0, at))
          trailer = buffer.slice(at + marker.length)
          held = new Uint8Array(0)
          return
        }
        const keep = partialTail(buffer)
        if (buffer.length > keep) controller.enqueue(buffer.slice(0, buffer.length - keep))
        held = buffer.slice(buffer.length - keep)
      },
      flush(controller) {
        if (!trailer) {
          if (held.length) controller.enqueue(held)
          return
        }
        try {
          browserDb().apply(JSON.parse(new TextDecoder().decode(trailer)) as Overlay)
          save()
        } catch (error) {
          console.warn(`standalone: the route's changes are lost (${String(error).slice(0, 200)})`)
        }
      },
    }),
  )
  const headers = new Headers(response.headers)
  headers.delete(OVERLAY_HEADER)
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

/** The rows for a header: without the chunks' vectors, none when too many. */
async function headerOverlay(overlay: Overlay): Promise<string | null> {
  const light: Overlay = {}
  for (const [table, rows] of Object.entries(overlay)) {
    light[table] = {}
    for (const [key, row] of Object.entries(rows)) {
      if (row && 'embedding' in row) {
        const { embedding: _embedding, ...rest } = row
        light[table][key] = rest
      } else light[table][key] = row
    }
  }
  const encoded = await encodeOverlay(light)
  return encoded.length <= HEADER_LIMIT ? encoded : null
}

let installed = false

/** The site's requests to its API carry the browser's rows and bring back the routes' writes. */
export function installFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/api/docs')
    )
      return original(input, init)
    const overlay = browserDb().overlay
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    let body = init?.body
    if (typeof body === 'string' && method !== 'GET' && method !== 'HEAD') {
      headers.set('content-type', headers.get('content-type') ?? 'application/json')
      if (headers.get('content-type')?.includes('application/json'))
        body = JSON.stringify({ [OVERLAY_FIELD]: overlay, body })
      else headers.set(OVERLAY_HEADER, (await headerOverlay(overlay)) ?? (await encodeOverlay({})))
    } else {
      // Always a header: it also tells the route the response may carry its changes back.
      headers.set(OVERLAY_HEADER, (await headerOverlay(overlay)) ?? (await encodeOverlay({})))
    }
    const request = input instanceof Request ? new Request(input, { ...init, headers, body }) : input
    const response = await original(request, input instanceof Request ? undefined : { ...init, headers, body })
    return untrail(response)
  }
}
