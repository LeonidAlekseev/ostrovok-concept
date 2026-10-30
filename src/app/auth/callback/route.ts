import { NextResponse, type NextRequest } from 'next/server'
import { resolveNext } from '@/lib/auth'

/**
 * The link of a sign-in email. The standalone demo sends none (only the demo accounts sign in): an old link opens the
 * sign-in form with the link's error.
 */
export async function GET(request: NextRequest) {
  const next = resolveNext(request.nextUrl.searchParams.get('next')) ?? '/'
  return NextResponse.redirect(new URL(`/login?error=link&next=${encodeURIComponent(next)}`, request.nextUrl.origin))
}
