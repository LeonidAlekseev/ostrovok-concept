import { z } from 'zod'
import { CATALOG_TAG } from '@/lib/db/anon'
import { component, errorSchema, type ApiOperation } from '@/lib/openapi/operation'

/** `POST /api/revalidate`: drops the server's cache of the catalogue; only for the bearer of the service role key. */

export const FORBIDDEN = 'Forbidden'

export const revalidateResponseSchema = component(
  'RevalidateResponse',
  z.object({ revalidated: z.array(z.string()).meta({ description: 'Сброшенные теги кэша' }) }),
)
export type RevalidateResponse = z.output<typeof revalidateResponseSchema>

export const revalidateOperations: ApiOperation[] = [
  {
    method: 'post',
    path: '/api/revalidate',
    operationId: 'revalidateCatalog',
    tags: ['Служебные'],
    summary: 'Сбросить кэш каталога',
    description:
      'После `npm run db:seed -- --revalidate <site>`: следующий запрос каждой страницы читает Supabase заново. Нужен секрет — ключ service role Supabase в `Authorization: Bearer`; он есть только у скрипта, значение здесь не публикуется. CDN держит ответы `/api/hotels` ещё до 5 минут.',
    security: ['serviceRole'],
    responses: {
      200: {
        description: 'Кэш сброшен',
        schema: revalidateResponseSchema,
        examples: { done: { summary: 'Каталог', value: { revalidated: [CATALOG_TAG] } } },
      },
      403: {
        description: 'Нет ключа или он неверный',
        schema: errorSchema,
        examples: { forbidden: { summary: 'Без ключа', value: { error: FORBIDDEN } } },
      },
    },
  },
]
