// Generates src/lib/db/database.types.ts from the live schema: npm run db:types (SUPABASE_DB_URL from .env.local).
// Read-only: the CLI only introspects the schema. The connection string goes to it as an argument and is never printed.
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set: run npm run secrets:reveal')
  process.exit(1)
}
const out = new URL('../src/lib/db/database.types.ts', import.meta.url)
const result = spawnSync('npx', ['supabase', 'gen', 'types', 'typescript', '--db-url', dbUrl, '--schema', 'public'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
})
if (result.status !== 0 || !result.stdout) process.exit(result.status || 1)
writeFileSync(out, result.stdout)
// The CLI output is unformatted; format it like the rest of the code so `format:check` covers it.
spawnSync('npx', ['prettier', '--write', out.pathname], { stdio: 'inherit' })
console.log(`Wrote ${out.pathname}`)
// The Supabase part of the API docs follows the types.
spawnSync('node', [new URL('./openapi-supabase.ts', import.meta.url).pathname], { stdio: 'inherit' })
