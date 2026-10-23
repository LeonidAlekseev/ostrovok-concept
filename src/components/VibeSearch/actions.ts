'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { semanticSearch } from '@/lib/ai/semantic'
import type { Hotel } from '@/lib/catalog'
import { loadAllHotels, loadDestinations } from '@/lib/db/catalog'
import { onePerCity, vibeHotels, vibeWish, VIBE_STEPS, type Answer } from '@/lib/vibe'

const answersSchema = z.array(z.union([z.literal(-1), z.literal(0), z.literal(1)])).length(VIBE_STEPS)

/** Nearest hotels the reranker orders: enough for six different cities. */
const CANDIDATES = 30

export interface VibePick {
  hotels: Hotel[]
  /** The ready-made route of the search by meaning; absent keeps the route on the rules. */
  routeId?: string
}

/**
 * The hotels of the answers over the whole catalogue: on the server, so the browser gets only the picked ones.
 * The semantic search reads the chosen sides as words and picks first, one hotel per city; the axes' scores
 * fill the rest, and they alone pick when the search is unavailable or the visitor is over the rate limit.
 * The same words find the ready-made route at the same time. The archetype and the shares need no catalogue
 * (and hold functions), so the browser reads them itself.
 */
export async function vibeHotelsAction(answers: Answer[]): Promise<VibePick> {
  const parsed = answersSchema.parse(answers)
  const [hotels, destinations] = await Promise.all([loadAllHotels(), loadDestinations()])
  const byRules = vibeHotels(parsed, hotels, destinations)
  const wish = vibeWish(parsed)
  const ip = await headers().then(
    (list) => clientIp({ headers: list }),
    () => 'local',
  )
  if (!wish || !allowRequest(ip)) return { hotels: byRules }
  const [hits, routes] = await Promise.all([
    semanticSearch(wish, { kind: 'hotel', k: CANDIDATES, candidates: CANDIDATES }),
    semanticSearch(wish, { kind: 'route', k: 1 }),
  ])
  const routeId = routes?.[0]?.id
  if (!hits) return { hotels: byRules, routeId }
  const byId = new Map(hotels.map((h) => [h.id, h]))
  return { hotels: onePerCity([...hits.flatMap((hit) => byId.get(hit.id) ?? []), ...byRules]), routeId }
}
