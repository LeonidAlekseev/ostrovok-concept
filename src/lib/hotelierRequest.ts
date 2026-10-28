import type { ToolResult } from './toolResult'

/**
 * The block «Запрос отельеру» of a run of `ask_hotelier` (src/lib/ai/hotelierTool.ts): what its result's `data` says
 * of the request — the hotel, the question, the characteristics, and once the hotelier answered, the answer and the
 * state of its knowledge (`answer_hotelier_request`, src/lib/db/hotelierKnowledge.ts).
 */
export interface HotelierRequestView {
  requestId: string
  hotelName: string | null
  status: 'pending' | 'answered'
  question: string
  keys: string[]
  answer: string | null
  answeredAt: string | null
  /** `queued`: the characteristics are being extracted; `done`, `none`: they are in the block or there are none. */
  knowledge: 'queued' | 'done' | 'none' | null
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** The request of the result; `null` for a result of another tool or one off the shape. */
export function requestViewOf(result: ToolResult): HotelierRequestView | null {
  const data = result.data ?? {}
  const requestId = text(data.request_id)
  const question = text(data.question)
  if (!requestId || !question) return null
  const keys = Array.isArray(data.requested_characteristics)
    ? data.requested_characteristics.filter((k): k is string => typeof k === 'string')
    : []
  const knowledge =
    data.knowledge === 'queued' || data.knowledge === 'done' || data.knowledge === 'none' ? data.knowledge : null
  return {
    requestId,
    hotelName: text(data.hotel_name),
    status: data.request_status === 'answered' || result.status === 'success' ? 'answered' : 'pending',
    question,
    keys,
    answer: text(data.answer),
    answeredAt: text(data.answered_at),
    knowledge,
  }
}

/** The block still changes: the hotelier has not answered, or the answer's characteristics are on their way. */
export const isOpenRequest = (view: HotelierRequestView) => view.status === 'pending' || view.knowledge === 'queued'
