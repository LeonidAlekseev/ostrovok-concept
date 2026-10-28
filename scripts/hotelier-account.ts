// Prepares the demo hotelier: the account «Демо отельер» and its profile of a hotelier of every hotel.
//   npm run db:hotelier   (the keys come from .env.local, see README «Ключи API»)
// Idempotent: an existing account keeps its password and gets the same profile. Needs NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, DEMO_HOTELIER_EMAIL and DEMO_HOTELIER_PASSWORD; prints what it did, never the keys.
import { required, serviceClient } from './lib/node.ts'

const NAME = 'Демо отельер'
const PAGE = 1000

const supabase = serviceClient()
const email = required('DEMO_HOTELIER_EMAIL')

const { data: created, error } = await supabase.auth.admin.createUser({
  email,
  password: required('DEMO_HOTELIER_PASSWORD'),
  email_confirm: true,
  user_metadata: { name: NAME },
})
if (error && error.code !== 'email_exists') throw new Error(`demo hotelier: ${error.message}`)

/** The existing account's id: the admin API finds users by pages only. */
async function existingId(): Promise<string> {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw new Error(`demo hotelier: ${error.message}`)
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (data.users.length < PAGE) throw new Error('demo hotelier: the account exists but was not found')
  }
}

const userId = created.user?.id ?? (await existingId())
console.log(created.user ? 'demo hotelier: account created' : 'demo hotelier: account already exists')

const { error: profileError } = await supabase
  .from('hotelier_profiles')
  .upsert({ user_id: userId, display_name: NAME, is_demo: true, all_hotels: true }, { onConflict: 'user_id' })
if (profileError) throw new Error(`demo hotelier profile: ${profileError.message}`)
console.log('demo hotelier: profile of every hotel')
