import { NextResponse, type NextRequest } from 'next/server'

/**
 * The standalone demo keeps no session to refresh: the demo sign-in is a plain cookie (src/lib/standalone/client.ts).
 * The proxy passes every request on.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // Pages, route handlers and server actions; not the build output, images or other public files.
  matcher: ['/((?!_next/static|_next/image|images/|data/|favicon).*)'],
}
