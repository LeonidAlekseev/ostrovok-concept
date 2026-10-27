import { z } from 'zod'
import { component, type ApiOperation } from '@/lib/openapi/operation'

/** `GET /api/openapi.json`: this document itself. */

export const openApiDocumentSchema = component(
  'OpenApiDocument',
  z
    .looseObject({ openapi: z.string().meta({ examples: ['3.1.1'] }), info: z.looseObject({ title: z.string() }) })
    .meta({ description: 'Документ OpenAPI 3.1' }),
)

export const openApiOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/openapi.json',
    operationId: 'getOpenApi',
    tags: ['Документация'],
    summary: 'Этот документ',
    description:
      'OpenAPI 3.1 маршрутов сайта, сгенерированный из схем zod рядом с маршрутами (`src/app/api/**/schema.ts`). Страница — `/api/docs`.',
    responses: { 200: { description: 'Документ', schema: openApiDocumentSchema } },
  },
]
