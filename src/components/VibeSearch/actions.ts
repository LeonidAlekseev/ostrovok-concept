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

/**
 * The hotels of the answers over the whole catalogue: on the server, so the browser gets only the picked ones.
 * The semantic search reads the chosen sides as words and picks first, one hotel per city; the axes' scores
 * fill the rest, and they alone pick when the search is unavailable or the visitor is over the rate limit.
 * The archetype and the shares need no catalogue
 * (and hold functions), so the browser reads them itself.
 */
export async function vibeHotelsAction(answers: Answer[]): Promise<Hotel[]> {
  const parsed = answersSchema.parse(answers)
  const [hotels, destinations] = await Promise.all([loadAllHotels(), loadDestinations()])
  const byRules = vibeHotels(parsed, hotels, destinations)
  const wish = vibeWish(parsed)
  const ip = await headers().then(
    (list) => clientIp({ headers: list }),
    () => 'local',
  )
  if (!wish || !allowRequest(ip)) return byRules
  const hits = await semanticSearch(wish, { k: CANDIDATES, candidates: CANDIDATES })
  if (!hits) return byRules
  const byId = new Map(hotels.map((h) => [h.id, h]))
  return onePerCity([...hits.flatMap((hit) => byId.get(hit.id) ?? []), ...byRules])
}
