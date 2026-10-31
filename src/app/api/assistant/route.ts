import { apiError } from '@/lib/api'
import { allowHotelRequest, allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { VACATION_REPLY, type AssistantResponse } from '@/lib/assistant'
import { assistantRequestSchema } from './schema'

/**
 * The standalone demo asks no model: Эвал answers every message with `VACATION_REPLY` and keeps the brief as it
 * came. The full turn (search, tools, models of the NVIDIA API) lives in the branches `dev` and `main`.
 */
export async function POST(request: Request) {
  const parsedBody = assistantRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return apiError(400, 'Invalid request')
  const { brief } = parsedBody.data
  const allowed = typeof brief.hotelId === 'string' ? allowHotelRequest : allowRequest
  if (!(await allowed(clientIp(request)))) return apiError(429, 'Too many requests')
  return Response.json({ brief, reply: VACATION_REPLY, source: 'rules' } satisfies AssistantResponse)
}
