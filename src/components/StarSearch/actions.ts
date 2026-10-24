'use server'

import { z } from 'zod'
import { loadAllHotels, loadDestinations } from '@/lib/db/catalog'
import { readStars, type Reading, type ReadingInput } from '@/lib/horoscope'

const inputSchema = z.object({
  name: z.string().max(24),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  checkIn: z.iso.date(),
  company: z.enum(['solo', 'pair', 'group']),
  partnerSignId: z.string().max(20).optional(),
  direction: z.enum(['north', 'south', 'east', 'west']).optional(),
  country: z.string().max(40).optional(),
  destinationId: z.string().max(40).optional(),
})

/** The stars' choice over the whole catalogue: on the server, so the browser gets only the three hotels. */
export async function readStarsAction(input: ReadingInput): Promise<Reading> {
  const parsed = inputSchema.parse(input)
  const [destinations, hotels] = await Promise.all([loadDestinations(), loadAllHotels()])
  return readStars(parsed, destinations, hotels)
}
