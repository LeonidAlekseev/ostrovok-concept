// Prepares the demo hotelier: the account «Демо отельер» and its profile of a hotelier of every hotel.
//   npm run db:hotelier   (the keys come from .env, see README «Ключи API»)
// Idempotent: an existing account keeps its password and gets the same profile. Needs NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, DEMO_HOTELIER_EMAIL and DEMO_HOTELIER_PASSWORD; prints what it did, never the keys.
import { required, serviceClient, userIdByEmail } from './lib/node.ts'

const NAME = 'Демо отельер'

const supabase = serviceClient()
const email = required('DEMO_HOTELIER_EMAIL')

const { data: created, error } = await supabase.auth.admin.createUser({
  email,
  password: required('DEMO_HOTELIER_PASSWORD'),
  email_confirm: true,
  user_metadata: { name: NAME },
})
if (error && error.code !== 'email_exists') throw new Error(`demo hotelier: ${error.message}`)

const userId = created.user?.id ?? (await userIdByEmail(supabase, email))
if (!userId) throw new Error('demo hotelier: the account exists but was not found')
console.log(created.user ? 'demo hotelier: account created' : 'demo hotelier: account already exists')

const { error: profileError } = await supabase
  .from('hotelier_profiles')
  .upsert({ user_id: userId, display_name: NAME, is_demo: true, all_hotels: true }, { onConflict: 'user_id' })
if (profileError) throw new Error(`demo hotelier profile: ${profileError.message}`)
console.log('demo hotelier: profile of every hotel')
