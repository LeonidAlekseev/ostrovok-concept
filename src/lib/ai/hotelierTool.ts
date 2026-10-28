import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../db/database.types'
import { HOTELIER_KEYS, characteristicLabel } from '../hotelierFacts'
import { errorResult, type ToolResult } from '../toolResult'

/**
 * Эвал's tool «Запрос отельеру» (`ask_hotelier`): a question about the hotel its data cannot answer goes to the
 * hotel's hotelier for the signed-in traveller, linked to their chat and to the run of the tool the route has just
 * started in `tool_runs`. Only the server asks (`create_hotelier_request` is the service role's): a traveller cannot
 * make a question look like Эвал's, and the database checks the run is a running `ask_hotelier` of that chat. The
 * result is `pending` — a normal state, not an error: the run waits in `tool_runs` without a
 * request, a stream or a worker held open, and the hotelier's answer finishes it (`answer_hotelier_request`). The
 * traveller's identical open question is the same request; the database keeps the limits.
 */

export const ASK_HOTELIER_TOOL = 'ask_hotelier'
export const ASK_HOTELIER_TITLE = 'Запрос отельеру'

export const askHotelierInputSchema = z.object({
  hotelId: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(500),
  characteristicKeys: z.array(z.enum(HOTELIER_KEYS)).max(10).optional(),
  roomTypeId: z.string().min(1).max(100).optional(),
  contextSummary: z.string().trim().max(500).optional(),
  originSessionId: z.uuid().optional(),
})
export type AskHotelierInput = z.infer<typeof askHotelierInputSchema>

/** What the result's `data` holds: the browser's block reads it (src/lib/hotelierRequest.ts). */
export interface AskHotelierData {
  request_id: string
  hotel_id: string
  hotel_name: string
  request_status: 'pending'
  question: string
  requested_characteristics: string[]
  reused: boolean
}

const LIMITATIONS = [
  'Отельер отвечает лично: ответ появится в этом блоке и в чате, когда он ответит',
  'Пока ответа нет, Эвал не подтверждает эти сведения',
]

const failureOf = (error: { code?: string; message?: string }) =>
  error.message === 'hotelier_request_limit'
    ? errorResult('rate_limited', 'Слишком много вопросов отельеру: попробуйте позже')
    : error.message === 'hotelier_request_invalid'
      ? errorResult('invalid_request', 'Этот вопрос нельзя передать отельеру')
      : errorResult('store_unavailable', 'Не получилось передать вопрос отельеру')

/**
 * Leaves the question for the hotel's hotelier. `traveller` is the signed-in user the route checked, their chat and
 * the row of the run the request is linked to (`null` for a guest: then nothing is asked); `service` the client with
 * the service role (`null` without it).
 */
export async function runAskHotelier(
  service: SupabaseClient<Database> | null,
  input: AskHotelierInput,
  {
    hotelName,
    traveller,
  }: { hotelName: string; traveller: { userId: string; chatId: string; runId: string | null } | null },
): Promise<ToolResult> {
  const parsed = askHotelierInputSchema.safeParse(input)
  if (!parsed.success) return errorResult('invalid_request', 'Этот вопрос нельзя передать отельеру')
  if (!traveller) return errorResult('sign_in_required', 'Войдите, чтобы Эвал спросил отельера')
  // Without its run in `tool_runs` the question would be nobody's tool's: it is not asked.
  if (!service || !traveller.runId) return errorResult('store_unavailable', 'Не получилось передать вопрос отельеру')
  const { hotelId, question, characteristicKeys = [], roomTypeId, contextSummary } = parsed.data
  const { data, error } = await service.rpc('create_hotelier_request', {
    traveller: traveller.userId,
    hotel_id: hotelId,
    question,
    origin_chat_id: traveller.chatId,
    origin_tool_run_id: traveller.runId,
    characteristic_keys: characteristicKeys,
    ...(roomTypeId && { room_ref: roomTypeId }),
    ...(contextSummary && { context_summary: contextSummary }),
  })
  const made = data?.[0]
  if (error || !made) {
    console.warn(`ask_hotelier: not asked (${String(error?.code ?? 'no row').slice(0, 40)})`)
    return failureOf(error ?? {})
  }
  const labels = characteristicKeys.map(characteristicLabel)
  return {
    status: 'pending',
    summary: made.reused
      ? `Этот вопрос уже ждёт ответа отельера «${hotelName}»`
      : `Вопрос передан отельеру «${hotelName}»: ответ придёт сюда`,
    data: {
      request_id: made.request,
      hotel_id: hotelId,
      hotel_name: hotelName,
      request_status: 'pending',
      question,
      requested_characteristics: characteristicKeys,
      reused: made.reused,
    } satisfies AskHotelierData,
    evidence: [],
    claims: [],
    calculations: [],
    method: null,
    limitations: labels.length > 0 ? [...LIMITATIONS, `Спрошено: ${labels.join(', ')}`] : LIMITATIONS,
    error: null,
  }
}
