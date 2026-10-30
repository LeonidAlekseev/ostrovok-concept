import { z } from 'zod'
import { component, type ApiOperation } from '@/lib/openapi/operation'

/** `GET /health`: liveness for the Docker healthcheck; outside `/api`, so no prefix. */

export const healthResponseSchema = component(
  'HealthResponse',
  z.object({ status: z.literal('ok').meta({ description: 'Всегда `ok`, пока процесс отвечает' }) }),
)
export type HealthResponse = z.output<typeof healthResponseSchema>

export const healthOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tags: ['Служебные'],
    summary: 'Проверка, что сервер жив',
    description: 'Без базы и ключей: отвечает, пока работает процесс. Для healthcheck Docker. Не кэшируется.',
    responses: {
      200: {
        description: 'Сервер жив',
        schema: healthResponseSchema,
        headers: { 'Cache-Control': { description: 'Не кэшировать', schema: { type: 'string' } } },
        examples: { ok: { summary: 'Жив', value: { status: 'ok' } } },
      },
    },
  },
]
