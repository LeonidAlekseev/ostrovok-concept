// Writes src/lib/openapi/supabase.gen.json, the Supabase part of the API docs, from database.types.ts and the calls of
// src: npm run docs:supabase (npm run db:types runs it too). No keys: it reads only the files.
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabaseDocument } from '../src/lib/openapi/supabaseGenerate.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = new URL('../src/lib/openapi/supabase.gen.json', import.meta.url)
writeFileSync(out, `${JSON.stringify(supabaseDocument(root), null, 2)}\n`)
spawnSync('npx', ['prettier', '--write', out.pathname], { stdio: 'inherit' })
console.log(`Wrote ${out.pathname}`)
