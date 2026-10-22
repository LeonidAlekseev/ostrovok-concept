'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { semanticSearch } from '@/lib/ai/semantic'
import { loadAllHotels, loadDestinations } from '@/lib/db/catalog'
import { readStars, starWish, type Reading, type ReadingInput } from '@/lib/horoscope'

const inputSchema = z.object({
  name: z.string().max(24),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  checkIn: z.iso.date(),
  company: z.enum(['solo', 'pair', 'group']),
  partnerSignId: z.string().max(20).optional(),
})

/**
 * The search by meaning for the route gets the orb's swirl (READING_MS of StarSearchDialog): the reading
 * itself is instant, and the result must not wait longer than the swirl.
 */
const ROUTE_TIMEOUT_MS = 2500

/**
 * The stars' choice over the whole catalogue: on the server, so the browser gets only the three hotels; with
 * the ready-made route the search by meaning finds for the reading (`routeId`), absent to keep the rules.
 */
export async function readStarsAction(input: ReadingInput): Promise<Reading & { routeId?: string }> {
  const parsed = inputSchema.parse(input)
  const [destinations, hotels] = await Promise.all([loadDestinations(), loadAllHotels()])
  const reading = readStars(parsed, destinations, hotels)
  const ip = await headers().then(
    (list) => clientIp({ headers: list }),
    () => 'local',
  )
  if (!allowRequest(ip)) return reading
  const routes = await semanticSearch(starWish(reading, parsed.company), {
    kind: 'route',
    k: 1,
    timeoutMs: ROUTE_TIMEOUT_MS,
  })
  return routes ? { ...reading, routeId: routes[0]?.id } : reading
}
