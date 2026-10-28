// What the TypeScript scripts share (Node runs them itself: `node scripts/<name>.ts`). Importing this module first
// lets the app's modules load with `await import('../src/…/x.ts')`: they import each other without extensions, as
// the bundler allows, and the hook below adds `.ts` for Node.
import { registerHooks } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/db/database.types.ts'

/** `server-only` is Next's guard of the server's modules; a script is the server's too. */
const SERVER_ONLY = new URL('../../node_modules/next/dist/compiled/server-only/empty.js', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return nextResolve(SERVER_ONLY, context)
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})

/** A table of the schema, for the helpers that take its name. */
export type Table = keyof Database['public']['Tables']

/** The variable from .env.local (`node --env-file-if-exists`), or a failure that names it and never prints a value. */
export function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

/** A client with the service role key: it bypasses RLS, so only the scripts have it, never the app's bundle. */
export const serviceClient = () =>
  createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

/** The id of the account with `email`: the admin API finds users by pages only. `null` when there is none. */
export async function userIdByEmail(client: ReturnType<typeof serviceClient>, email: string): Promise<string | null> {
  const PAGE = 1000
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw new Error(`users: ${error.message}`)
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (data.users.length < PAGE) return null
  }
}
