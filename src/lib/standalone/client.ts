import { Query, type Row } from './query'
import type { Db } from './store'

/**
 * The standalone demo's stand-in for the Supabase client: the same `from`, `rpc`, `auth`, `channel` and `storage`
 * the site calls, over a `Db` (the snapshot under the browser's own rows). The demo accounts sign in without a
 * password: who is signed in is a cookie (`DEMO_COOKIE`), which holds no secret.
 */

/** The cookie of the demo sign-in: `traveller` or `hotelier`. */
export const DEMO_COOKIE = 'standalone-demo'

export type DemoAccount = 'traveller' | 'hotelier'

export interface DemoUser {
  id: string
  email: string
  user_metadata: { name: string }
  app_metadata: Record<string, never>
  aud: 'authenticated'
  created_at: string
}

export interface AuthSource {
  user(): DemoUser | null
  signOut?(): void
  onChange?(listener: () => void): () => void
}

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'
type Listener = { event: '*' | ChangeEvent; table: string; filter?: [string, string]; callback: (payload: Row) => void }

/** A channel of «Realtime»: the writes of the page's `Db` (its own, the server's answers, the other tabs'). */
export class StandaloneChannel {
  private listeners: Listener[] = []
  private stop?: () => void

  constructor(
    private readonly db: () => Db,
    readonly topic: string,
  ) {}

  on(
    _type: 'postgres_changes',
    options: { event: string; table: string; filter?: string },
    callback: (payload: any) => void,
  ) {
    const filter = /^([a-z_]+)=eq\.(.+)$/.exec(options.filter ?? '')
    this.listeners.push({
      event: options.event as Listener['event'],
      table: options.table,
      filter: filter ? [filter[1], filter[2]] : undefined,
      callback,
    })
    return this
  }

  subscribe(callback?: (status: string) => void) {
    const db = this.db()
    this.stop = db.subscribe((table, row, old) => {
      const event: ChangeEvent = !row ? 'DELETE' : old ? 'UPDATE' : 'INSERT'
      const value = row ?? old!
      for (const l of this.listeners) {
        if (l.table !== table || (l.event !== '*' && l.event !== event)) continue
        if (l.filter && String(value[l.filter[0]]) !== l.filter[1]) continue
        // The policies of the table: a row the user may not see comes with no row, as Realtime sends it.
        const seen = row && db.rows(table).includes(row)
        l.callback({
          eventType: event,
          table,
          schema: 'public',
          new: seen ? row : {},
          old: old ?? {},
          errors: seen ? null : ['denied'],
        })
      }
    })
    queueMicrotask(() => callback?.('SUBSCRIBED'))
    return this
  }

  unsubscribe() {
    this.stop?.()
    this.stop = undefined
    return Promise.resolve('ok')
  }
}

/** A bucket of the storage: the photos of the chats stay data URLs in the rows, so there are no files. */
const bucket = (name: string) => ({
  upload: async () => ({ data: null, error: { message: `standalone: the bucket ${name} keeps no files` } }),
  download: async () => ({ data: null, error: { message: `standalone: the bucket ${name} keeps no files` } }),
  remove: async () => ({ data: [], error: null }),
  list: async () => ({ data: [], error: null }),
  copy: async () => ({ data: null, error: { message: `standalone: the bucket ${name} keeps no files` } }),
  createSignedUrls: async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: null, error: 'standalone' })),
    error: null,
  }),
  getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
})

export function standaloneClient(db: () => Db, auth: AuthSource) {
  const session = () => {
    const user = auth.user()
    return user ? { access_token: 'standalone-demo', token_type: 'bearer', user } : null
  }
  return {
    from: (table: string) => new Query(db(), table),
    rpc: (name: string, args: Row = {}, _options?: unknown) => new Query(db(), name, { name, args }),
    auth: {
      getUser: async () => ({ data: { user: auth.user() }, error: null }),
      getSession: async () => ({ data: { session: session() }, error: null }),
      getClaims: async () => {
        const user = auth.user()
        return { data: user ? { claims: { sub: user.id } } : null, error: null }
      },
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        const stop = auth.onChange?.(() => callback(auth.user() ? 'SIGNED_IN' : 'SIGNED_OUT', session()))
        queueMicrotask(() => callback('INITIAL_SESSION', session()))
        return { data: { subscription: { unsubscribe: () => stop?.() } } }
      },
      signOut: async () => {
        auth.signOut?.()
        return { error: null }
      },
      signInWithOtp: async () => ({ data: null, error: { message: 'Вход по почте недоступен в демо-версии' } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'Вход по паролю недоступен в демо-версии' } }),
    },
    realtime: { setAuth: async () => {} },
    channel: (topic: string) => new StandaloneChannel(db, topic),
    removeChannel: async (channel: StandaloneChannel) => channel.unsubscribe(),
    storage: { from: bucket },
  }
}

export type StandaloneClient = ReturnType<typeof standaloneClient>

/** The demo user of an account; the name is the profile's. */
export function demoUser(id: string, name: string): DemoUser {
  return {
    id,
    email: '',
    user_metadata: { name },
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-21T00:00:00.000Z',
  }
}
