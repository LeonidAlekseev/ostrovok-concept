import { z } from 'zod'
import { suggestLeisure, type LeisureRequest } from '@/lib/ai/leisure'
import { getAssistantModel } from '@/lib/ai/model'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { addDays } from '@/lib/dates'
import { loadDestination } from '@/lib/db/catalog'
import { loadTrip } from '@/lib/db/trips'
import { ALTERNATIVES_ERROR, isoDate, leisureItem } from '@/lib/trip'

/** The item as the page shows it: the saved plan may lag behind the last edits by the save delay. */
const requestSchema = z.object({ leisure: leisureItem, start: isoDate })

type Context = { params: Promise<{ tripId: string }> }

/**
 * «Предложить другое»: three alternatives of a leisure item of the user's plan from the language model, only on
 * the user's request. Someone else's plan is not found; a model error or 8 s without an answer is an error, and
 * the plan stays as it was.
 */
export async function POST(request: Request, { params }: Context) {
  if (!allowRequest(`leisure:${clientIp(request)}`))
    return Response.json({ error: ALTERNATIVES_ERROR }, { status: 429 })
  const body = requestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'Invalid request' }, { status: 400 })

  const loaded = await loadTrip((await params).tripId).catch(() => undefined)
  if (loaded === undefined) return Response.json({ error: ALTERNATIVES_ERROR }, { status: 503 })
  if (!loaded) return Response.json({ error: 'План не найден' }, { status: 404 })
  const { trip } = loaded
  const { leisure: current, start } = body.data

  const model = await getAssistantModel()
  if (!model) return Response.json({ error: ALTERNATIVES_ERROR }, { status: 503 })
  const destination = await loadDestination(trip.route.destinationId).catch(() => undefined)
  const leisure: LeisureRequest = {
    city: destination?.name ?? trip.route.destinationId,
    day: current.day,
    date: addDays(start, current.day - 1),
    current,
    taken: trip.leisure.filter((item) => item.id !== current.id).map((item) => item.title),
  }
  try {
    return Response.json({ options: await suggestLeisure(model, leisure, request.signal) })
  } catch (error) {
    // The kind and the provider's short message; never the request itself.
    const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
    console.warn(`alternatives: model failed (${reason})`)
    return Response.json({ error: ALTERNATIVES_ERROR }, { status: 502 })
  }
}
