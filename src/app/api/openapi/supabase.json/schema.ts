import type { ApiOperation } from '@/lib/openapi/operation'
import { openApiDocumentSchema } from '../../openapi.json/schema'

/** `GET /api/openapi/supabase.json`: the Supabase part of the docs. */

export const supabaseOpenApiOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/openapi/supabase.json',
    operationId: 'getSupabaseOpenApi',
    tags: ['Документация'],
    summary: 'Раздел Supabase',
    description:
      'OpenAPI 3.1 таблиц, представлений и функций Supabase, которые вызывает код сайта, — из `database.types.ts` (`npm run docs:supabase`). Сервер — адрес проекта Supabase; ключ `apikey` вводится вручную.',
    responses: { 200: { description: 'Документ', schema: openApiDocumentSchema } },
  },
]
