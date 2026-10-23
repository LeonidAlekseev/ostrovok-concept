import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './lib/supabase/config'

/** Supabase keeps the session in `sb-<project>-auth-token` cookies, split into `.0`, `.1`… when long. */
const hasSessionCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))

/**
 * Refreshes an expiring Supabase session and passes the new cookies both to the page being rendered and to the
 * browser. Guests carry no session cookie and skip the round trip to Supabase.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured || !hasSessionCookie(request)) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })
  // Validates the token and refreshes it when it is about to expire; nothing may run between this and the return.
  await supabase.auth.getClaims()
  return response
}

export const config = {
  // Pages, route handlers and server actions; not the build output, images or other public files.
  matcher: ['/((?!_next/static|_next/image|images/|data/|favicon).*)'],
}
