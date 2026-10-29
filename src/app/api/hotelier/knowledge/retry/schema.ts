import { z } from 'zod'
import { component, errorSchema, type ApiOperation } from '@/lib/openapi/operation'

/** `POST /api/hotelier/knowledge/retry`: tries the due answers' knowledge again; the bearer of the service role key (POST) or of `CRON_SECRET` (GET, Vercel Cron). */

export const FORBIDDEN = 'Forbidden'
/** How many due answers one call takes: each is an extraction by the model, and the call is one function run. */
export const RETRY_LIMIT = 5

export const knowledgeRetryResponseSchema = component(
  'HotelierKnowledgeRetryResponse',
  z.object({ processed: z.number().int().meta({ description: 'Сколько ответов отельеров разобрано за вызов' }) }),
)
export type KnowledgeRetryResponse = z.output<typeof knowledgeRetryResponseSchema>

const responses = {
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
}

export const knowledgeRetryOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotelier/knowledge/retry',
    operationId: 'cronRetryHotelierKnowledge',
    tags: ['Служебные'],
    summary: 'Повторить извлечение сведений отельеров (cron)',
    description: `То же, что POST, для Vercel Cron (\`vercel.json\`, раз в сутки в 03:17 UTC — предел тарифа Hobby; cron вызывает только GET). Нужен секрет \`CRON_SECRET\` в \`Authorization: Bearer\`; Vercel подставляет его сам, значение здесь не публикуется.`,
    security: ['cronSecret'],
    responses,
  },
  {
    method: 'post',
    path: '/api/hotelier/knowledge/retry',
    operationId: 'retryHotelierKnowledge',
    tags: ['Служебные'],
    summary: 'Повторить извлечение сведений отельеров',
    description: `Берёт до ${RETRY_LIMIT} ответов отельеров, чьё извлечение не удалось или оборвалось и чья пауза вышла, и разбирает их заново. Для скриптов; по расписанию то же делает GET. Нужен секрет — ключ service role Supabase в \`Authorization: Bearer\`; значение здесь не публикуется. Весь список без пауз и лимита попыток — \`npm run db:hotelier-knowledge\`.`,
    security: ['serviceRole'],
    responses,
  },
]
