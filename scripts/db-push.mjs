// Applies supabase/migrations to the project's database: npm run db:push (SUPABASE_DB_URL from .env).
// The connection string goes to the CLI as an argument and is never printed.
import { spawnSync } from 'node:child_process'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set: run npm run secrets:reveal')
  process.exit(1)
}
const args = ['supabase', 'db', 'push', '--db-url', dbUrl, ...process.argv.slice(2)]
process.exit(spawnSync('npx', args, { stdio: 'inherit' }).status ?? 1)
