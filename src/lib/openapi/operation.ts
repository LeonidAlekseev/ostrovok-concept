import { z } from 'zod'

/**
 * What the `schema.ts` of each route of src/app/api describes for the OpenAPI document (`/api/openapi.json`): its
 * operations with the zod schemas of the request and the answer. The route parses its request with the same schemas
 * and its answer `satisfies` the answer's schema, so the document cannot drift from the code.
 */

/** The schemas of the document's `components/schemas`, by their id: they refer to each other by `$ref`. */
export const apiSchemas = z.registry<{ id: string }>()

/** Registers the schema as the component `id` of the document. */
export function component<T extends z.ZodType>(id: string, schema: T): T {
  apiSchemas.add(schema, { id })
  return schema
}

/** TypeScript's own identity of two types: every field, optional or not, the same in both. */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/**
 * Compiles only when the two types are the same: the output of a zod schema and the domain type it describes
 * (`sameType<z.output<typeof hotelSchema>, Hotel>()`). A field added to one and not the other, even an optional one,
 * fails `npm run typecheck` with «Expected 1 arguments».
 */
export const sameType = <A, B>(...proof: Same<A, B> extends true ? [] : [never]) => proof

/** `{ error }` with a short English text, the shape of every error of src/lib/api.ts (`apiError`). */
export const errorSchema = component(
  'Error',
  z
    .object({ error: z.string().meta({ description: 'Короткий текст для логов и разработчика' }) })
    .meta({ description: 'Ошибка: браузер смотрит только на статус и говорит о ней по-русски сам' }),
)

export interface ApiExample {
  summary: string
  description?: string
  value: unknown
}

export interface ApiResponse {
  description: string
  /** A registered component (`component`); none for an answer without a body. */
  schema?: z.ZodType
  examples?: Record<string, ApiExample>
  headers?: Record<string, { description: string; schema: { type: 'string' } }>
}

export interface ApiParameter {
  name: string
  in: 'path' | 'query' | 'header'
  description: string
  required?: boolean
  /** The schema of the value as it is written in the request: `io: 'input'`. */
  schema: z.ZodType
  example?: string
}

export interface ApiOperation {
  method: 'get' | 'post'
  /** The OpenAPI path: `/api/hotels/{hotelId}/view`. */
  path: string
  operationId: string
  tags: string[]
  summary: string
  description: string
  parameters?: ApiParameter[]
  body?: { description: string; schema: z.ZodType; examples?: Record<string, ApiExample> }
  responses: Record<number, ApiResponse>
  /** Names of the document's `securitySchemes`. */
  security?: string[]
  /** The answer is GeoJSON or points the docs page draws on its map (`geoOfResponse`). */
  geo?: true
}

/** The CDN's cache of a public answer (`CDN_CACHE_HEADERS`), as the document describes it. */
export const cacheHeader = {
  'Cache-Control': {
    description: 'CDN хранит ответ 5 минут и отдаёт устаревший час, пока обновляет',
    schema: { type: 'string' as const },
  },
}
