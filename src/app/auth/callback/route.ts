import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveNext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * The link from the sign-in email: `code` from Supabase's own link (PKCE), or `token_hash` and `type` from a custom
 * email template. Opens `next` on success and the sign-in form with an error otherwise.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const next = resolveNext(params.get('next')) ?? '/'

  const supabase = await createClient()
  let ok = false
  if (supabase && code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  else if (supabase && tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error

  const target = ok ? next : `/login?error=link&next=${encodeURIComponent(next)}`
  return NextResponse.redirect(new URL(target, request.nextUrl.origin))
}
