/**
 * The public Supabase settings, inlined into the client bundle at build time (`NEXT_PUBLIC_*` must be read
 * literally). Without them the site works as before: sign-in reports «Вход временно недоступен».
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const AUTH_UNAVAILABLE = 'Вход временно недоступен'
