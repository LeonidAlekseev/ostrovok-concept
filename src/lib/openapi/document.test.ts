import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Validator } from '@seriousme/openapi-schema-validator'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { API_OPERATIONS, apiDocument, supabaseApiDocument } from './document'
import { supabaseDocument } from './supabaseGenerate'
import supabaseGenerated from './supabase.gen.json'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const apiDir = join(root, 'src/app/api')

type Json = Record<string, unknown>

/** Every `route.ts` of src/app/api as its OpenAPI path and the methods it exports. */
function routeFiles(dir = apiDir): { path: string; methods: string[]; file: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(file)
    if (entry.name !== 'route.ts') return []
    const path = `/api/${relative(apiDir, dir).split(sep).join('/')}`.replace(/\[(\w+)\]/g, '{$1}')
    const text = readFileSync(file, 'utf8')
    const methods = [
      ...text.matchAll(/export (?:async )?(?:function |const )(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g),
    ].map(([, method]) => method.toLowerCase())
    return [{ path, methods, file: relative(root, file) }]
  })
}

/** Every `$ref` of the value, with where it is. */
function refs(value: unknown, at = '#'): { ref: string; at: string }[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => refs(item, `${at}/${i}`))
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, item]) =>
    key === '$ref' && typeof item === 'string' ? [{ ref: item, at }] : refs(item, `${at}/${key}`),
  )
}

const resolve = (document: unknown, ref: string) =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((node, key) => (node as Json | undefined)?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], document)

const documents = { api: apiDocument(), supabase: supabaseApiDocument() }

describe.each(Object.entries(documents))('the %s document', (_name, document) => {
  it('is valid OpenAPI 3.1', async () => {
    const validator = new Validator()
    const result = await validator.validate(structuredClone(document))
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
    expect(validator.version).toBe('3.1')
  })

  it('resolves every $ref', () => {
    const missing = refs(document).filter(({ ref }) => resolve(document, ref) === undefined)
    expect(missing).toEqual([])
  })

  it('has no key or secret', () => {
    const text = JSON.stringify(document)
    // Supabase's JWT keys, its new keys, NVIDIA's keys, a PGP armour.
    expect(text).not.toMatch(/eyJ[\w-]{10,}\.[\w-]{10,}|sb_(secret|publishable)_|nvapi-|BEGIN PGP/)
  })
})

describe('the routes of src/app/api', () => {
  // `/health` lives outside src/app/api and is described in the same document.
  const routes = [...routeFiles(), { path: '/health', methods: ['get'], file: 'src/app/health/route.ts' }]
  const paths = documents.api.paths as Record<string, Json>

  it('are found', () => {
    expect(routes.map((r) => r.path)).toContain('/api/hotels/{hotelId}/view')
  })

  it.each(routes)('$file: every method is described', ({ path, methods }) => {
    expect(methods.length).toBeGreaterThan(0)
    for (const method of methods) expect(paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined()
  })

  it('have nothing described that does not exist', () => {
    const described = API_OPERATIONS.map((op) => `${op.method} ${op.path}`)
    const existing = routes.flatMap(({ path, methods }) => methods.map((method) => `${method} ${path}`))
    expect(described.filter((op) => !existing.includes(op))).toEqual([])
  })
})

describe('the examples of the document', () => {
  const document = documents.api
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  // The components live in the root the `$ref`s point into.
  const check = (schema: Json, value: unknown) => {
    const validate = ajv.compile({ ...schema, components: document.components })
    return validate(value) ? [] : validate.errors
  }

  const cases = Object.entries(document.paths as Record<string, Record<string, Json>>).flatMap(([path, item]) =>
    Object.entries(item).flatMap(([method, op]) => {
      const name = `${method.toUpperCase()} ${path}`
      const responses = Object.entries(op.responses as Record<string, Json>).flatMap(([status, response]) => {
        const media = (response.content as Record<string, Json> | undefined)?.['application/json']
        return Object.entries((media?.examples ?? {}) as Record<string, { value: unknown }>).map(([id, example]) => ({
          name: `${name} → ${status} ${id}`,
          schema: media!.schema as Json,
          value: example.value,
        }))
      })
      const body = ((op.requestBody as Json | undefined)?.content as Record<string, Json> | undefined)?.[
        'application/json'
      ]
      const bodies = Object.entries((body?.examples ?? {}) as Record<string, { value: unknown }>).map(
        ([id, example]) => ({ name: `${name} body ${id}`, schema: body!.schema as Json, value: example.value }),
      )
      const parameters = ((op.parameters ?? []) as Json[])
        .filter((p) => p.example !== undefined)
        .map((p) => ({ name: `${name} ?${p.name}`, schema: p.schema as Json, value: p.example }))
      return [...responses, ...bodies, ...parameters]
    }),
  )

  it('are there', () => {
    expect(cases.length).toBeGreaterThan(10)
  })

  it.each(cases)('$name matches its schema', ({ schema, value }) => {
    expect(check(schema, value)).toEqual([])
  })

  it('are the real hotel of Valencia', () => {
    expect(JSON.stringify(document)).toContain('"ota-9096882"')
  })
})

describe('the Supabase document', () => {
  it('is generated from database.types.ts and the calls of src: npm run docs:supabase', () => {
    expect(supabaseGenerated).toEqual(supabaseDocument(root))
  })

  it('has the tables and the functions the browser and the server call', () => {
    const paths = Object.keys(supabaseGenerated.paths)
    expect(paths).toEqual(expect.arrayContaining(['/assistant_chats', '/hotels', '/rpc/hotel_noise_map']))
  })
})
