import { z } from 'zod'
import { assistantOperations } from '@/app/api/assistant/schema'
import { claimsOperations } from '@/app/api/hotels/[hotelId]/claims/schema'
import { searchOperations } from '@/app/api/hotels/[hotelId]/documents/search/schema'
import { relationsOperations } from '@/app/api/hotels/[hotelId]/relations/schema'
import { noiseMapOperations } from '@/app/api/hotels/[hotelId]/noise-map/schema'
import { viewMapOperations } from '@/app/api/hotels/[hotelId]/view-map/schema'
import { viewOperations } from '@/app/api/hotels/[hotelId]/view/schema'
import { hotelierOperations } from '@/app/api/hotelier/schema'
import { hotelierHotelsOperations } from '@/app/api/hotelier/hotels/schema'
import { knowledgeRetryOperations } from '@/app/api/hotelier/knowledge/retry/schema'
import { hotelierFactsOperations } from '@/app/api/hotels/[hotelId]/hotelier/facts/schema'
import { healthOperations } from '@/app/health/schema'
import { hotelsOperations } from '@/app/api/hotels/schema'
import { openApiOperations } from '@/app/api/openapi.json/schema'
import { supabaseOpenApiOperations } from '@/app/api/openapi/supabase.json/schema'
import { revalidateOperations } from '@/app/api/revalidate/schema'
import { apiSchemas, type ApiExample, type ApiOperation, type ApiResponse } from './operation'
import supabaseGenerated from './supabase.gen.json'

/**
 * The OpenAPI 3.1 documents of the docs page (`/api/docs`): the site's routes from the zod schemas next to them, and
 * the Supabase calls of the code (supabase.gen.json). Neither has a key's value: the routes that need one name it.
 */

/** Every operation of src/app/api: a test checks each route file and method against this list. */
export const API_OPERATIONS: readonly ApiOperation[] = [
  ...hotelsOperations,
  ...viewOperations,
  ...viewMapOperations,
  ...noiseMapOperations,
  ...claimsOperations,
  ...searchOperations,
  ...hotelierFactsOperations,
  ...hotelierHotelsOperations,
  ...knowledgeRetryOperations,
  ...relationsOperations,
  ...assistantOperations,
  ...hotelierOperations,
  ...revalidateOperations,
  ...openApiOperations,
  ...healthOperations,
  ...supabaseOpenApiOperations,
]

const TAGS = [
  { name: 'Отели', description: 'Каталог: отели по id, городам и рамке карты' },
  { name: 'Гео отеля', description: 'Вид из окон, здания и шум вокруг настоящего отеля Валенсии' },
  {
    name: 'Знания об отеле',
    description: 'Хранилище знаний: утверждения с источниками, поиск по отзывам, связи с местами',
  },
  {
    name: 'Эвал',
    description:
      'Ассистент: подбор по описанию, фото, характеристикам и отзывам; вопросы об отеле — места, маршруты пешком и на машине, «до …», вид из окна, шум, доступность, отзывы, отельер; карта и виджеты в ответе',
  },
  { name: 'Чат с отельером', description: 'Путешественник пишет отелю, отельер отвечает; нужна сессия' },
  { name: 'Служебные', description: 'Для скриптов: нужен секрет' },
  { name: 'Документация', description: 'Документы OpenAPI этой страницы' },
]

type JsonSchema = Record<string, unknown>

const ref = (schema: z.ZodType) => {
  const id = apiSchemas.get(schema)?.id
  if (!id) throw new Error('An answer of the document must be a component: wrap its schema in component()')
  return { $ref: `#/components/schemas/${id}` }
}

/** A schema of a parameter or a body as the request writes it, without the keys of a standalone JSON Schema. */
function inputSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema
  return rest
}

const examples = (items: Record<string, ApiExample> | undefined) => items && { examples: items }

function response({ description, schema, examples: items, headers }: ApiResponse) {
  return {
    description,
    ...(headers && { headers }),
    ...(schema && { content: { 'application/json': { schema: ref(schema), ...examples(items) } } }),
  }
}

function operation(op: ApiOperation) {
  return {
    operationId: op.operationId,
    tags: op.tags,
    summary: op.summary,
    description: op.description,
    ...(op.parameters && {
      parameters: op.parameters.map(({ schema, example, ...parameter }) => ({
        ...parameter,
        schema: inputSchema(schema),
        ...(example !== undefined && { example }),
      })),
    }),
    ...(op.body && {
      requestBody: {
        required: true,
        description: op.body.description,
        content: { 'application/json': { schema: inputSchema(op.body.schema), ...examples(op.body.examples) } },
      },
    }),
    responses: Object.fromEntries(Object.entries(op.responses).map(([status, item]) => [status, response(item)])),
    ...(op.security && { security: op.security.map((name) => ({ [name]: [] })) }),
    ...(op.geo && { 'x-geo': true }),
  }
}

/** The components: every registered schema once, referring to the others by `$ref`. */
function componentSchemas(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(apiSchemas, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
    uri: (id) => `#/components/schemas/${id}`,
  })
  // `$schema` and an `$id` with a fragment belong to a standalone schema, not to a component of OpenAPI.
  return Object.fromEntries(
    Object.entries(schemas).map(([id, { $schema: _schema, $id: _id, ...schema }]) => [id, schema as JsonSchema]),
  )
}

/** The document of the site's routes: `/api/openapi.json`. The server is the environment the page is opened in. */
export function apiDocument() {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const op of API_OPERATIONS) paths[op.path] = { ...paths[op.path], [op.method]: operation(op) }
  return {
    openapi: '3.1.1',
    info: {
      title: 'О!бъективно API',
      version: '1',
      description:
        'Маршруты сайта `src/app/api` и `/health`. Схемы — из zod рядом с маршрутами, примеры — реальные ответы по отелям Валенсии (длинные массивы сокращены). «Try it» отправляет запрос в текущее окружение; ответ гео-маршрута показывается на карте.',
    },
    servers: [{ url: '/', description: 'Текущее окружение' }],
    tags: TAGS,
    paths,
    components: {
      schemas: componentSchemas(),
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sb-<project>-auth-token',
          description: 'Сессия Supabase Auth в cookie браузера: вход на сайте.',
        },
        serviceRole: {
          type: 'http',
          scheme: 'bearer',
          description: 'Ключ service role Supabase. Есть только у скриптов; значение не публикуется.',
        },
        cronSecret: {
          type: 'http',
          scheme: 'bearer',
          description: '`CRON_SECRET` проекта на Vercel: Vercel Cron присылает его сам; значение не публикуется.',
        },
      },
    },
  }
}

/** The Supabase part: `/api/openapi/supabase.json`, with the project's public URL as its server when it is set. */
export function supabaseApiDocument() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return {
    ...supabaseGenerated,
    ...(url && { servers: [{ url: `${url.replace(/\/$/, '')}/rest/v1`, description: 'PostgREST проекта' }] }),
  }
}
