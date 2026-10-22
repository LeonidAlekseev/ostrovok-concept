'use server'

import { z } from 'zod'
import type { Hotel } from '@/lib/catalog'
import { loadAllHotels, loadDestinations } from '@/lib/db/catalog'
import { vibeHotels, VIBE_STEPS, type Answer } from '@/lib/vibe'

const answersSchema = z.array(z.union([z.literal(-1), z.literal(0), z.literal(1)])).length(VIBE_STEPS)

/**
 * The hotels of the answers over the whole catalogue: on the server, so the browser gets only the picked ones.
 * The archetype and the shares need no catalogue (and hold functions), so the browser reads them itself.
 */
export async function vibeHotelsAction(answers: Answer[]): Promise<Hotel[]> {
  const [hotels, destinations] = await Promise.all([loadAllHotels(), loadDestinations()])
  return vibeHotels(answersSchema.parse(answers), hotels, destinations)
}
