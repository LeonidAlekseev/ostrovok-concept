import { after } from 'next/server'
import { apiError, loadVisibleHotel } from '@/lib/api'
import { isRealHotelId } from '@/lib/db/anon'
import { loadHotelierClaims } from '@/lib/db/claims'
import { retryDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
import { claimRoom, claimValueText, conflictingIds } from '@/lib/hotelierClaims'
import { characteristicLabel, keyOfProperty } from '@/lib/hotelierFacts'
import { NOT_FOUND_ERROR, NO_STORE_HEADERS, STORE_ERROR, type HotelierFactsResponse } from './schema'

/**
 * The hotelier's current characteristics of a real hotel (`loadHotelierClaims`, fresh): what the hotel's page shows in
 * «Сведения отельера», each with its date, confidence, source and the «демо» mark of the demonstration data. 404 for
 * an unknown, hidden or synthetic hotel, 503 when the store fails. After the response the answers whose knowledge
 * failed or was cut off are tried again (`retryDueHotelierKnowledge`): the readers of the knowledge drive its retries.
 */
export async function GET(_request: Request, context: { params: Promise<{ hotelId: string }> }) {
  after(() => retryDueHotelierKnowledge())
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId).catch(() => undefined)
  if (!hotel || !isRealHotelId(hotel.id)) return apiError(404, NOT_FOUND_ERROR)
  const claims = await loadHotelierClaims(hotel.id)
  if (!claims) return apiError(503, STORE_ERROR)
  const conflicts = conflictingIds(claims)
  const facts = claims.flatMap((claim) => {
    const key = keyOfProperty(claim.property)
    if (!key || claim.status !== 'reported') return []
    const source = claim.evidence[0]
    return [
      {
        id: claim.id,
        characteristic: key,
        label: characteristicLabel(key),
        room: claimRoom(claim),
        value: claimValueText(claim),
        status: 'reported' as const,
        confidence: claim.confidence,
        observedAt: claim.observedAt,
        conflict: conflicts.has(claim.id),
        demo: claim.demo === true,
        limitations: claim.limitations,
        source: source ? { title: source.title, excerpt: source.excerpt, retrievedAt: source.retrievedAt } : null,
      },
    ]
  })
  return Response.json({ hotelId: hotel.id, facts } satisfies HotelierFactsResponse, { headers: NO_STORE_HEADERS })
}
