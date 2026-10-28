import { z } from 'zod'
import { component, errorSchema, type ApiOperation } from '@/lib/openapi/operation'

/** `POST /api/hotelier/knowledge/retry`: tries the due answers' knowledge again; only for the bearer of the service role key. */

export const FORBIDDEN = 'Forbidden'
/** How many due answers one call takes: each is an extraction by the model, and the call is one function run. */
export const RETRY_LIMIT = 5

export const knowledgeRetryResponseSchema = component(
  'HotelierKnowledgeRetryResponse',
  z.object({ processed: z.number().int().meta({ description: 'Сколько ответов отельеров разобрано за вызов' }) }),
)
export type KnowledgeRetryResponse = z.output<typeof knowledgeRetryResponseSchema>

export const knowledgeRetryOperations: ApiOperation[] = [
  {
    method: 'post',
    path: '/api/hotelier/knowledge/retry',
    operationId: 'retryHotelierKnowledge',
    tags: ['Служебные'],
    summary: 'Повторить извлечение сведений отельеров',
    description: `Берёт до ${RETRY_LIMIT} ответов отельеров, чьё извлечение не удалось или оборвалось и чья пауза вышла, и разбирает их заново. Для расписания (раз в 5–10 минут): повтор не ждёт, пока кто-то откроет страницу отеля. Нужен секрет — ключ service role Supabase в \`Authorization: Bearer\`; значение здесь не публикуется. Весь список без пауз и лимита попыток — \`npm run db:hotelier-knowledge\`.`,
    security: ['serviceRole'],
    responses: {
      200: {
        description: 'Вызов отработал',
        schema: knowledgeRetryResponseSchema,
        examples: { done: { summary: 'Два ответа', value: { processed: 2 } } },
      },
      403: {
        description: 'Нет ключа или он неверный',
        schema: errorSchema,
        examples: { forbidden: { summary: 'Без ключа', value: { error: FORBIDDEN } } },
      },
    },
  },
]
