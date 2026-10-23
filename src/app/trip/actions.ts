'use server'

import { refresh } from 'next/cache'
import { redirect, RedirectType } from 'next/navigation'
import { similarHotels } from '@/lib/ai/semantic'
import { todayIso } from '@/lib/dates'
import { loadRoute } from '@/lib/db/routes'
import { createTrip, deleteTrip, saveTrip } from '@/lib/db/trips'
import { copyRoute, newTripPath, tripPath } from '@/lib/trip'

const SAVE_ERROR = 'Не удалось сохранить план'

/** Short for the logs: the kind and the message, never the request. */
const reason = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)

/**
 * «Повторить маршрут»: copies the route into a plan of the signed-in user and opens it; a guest signs in first
 * and comes back here. Replaces the address, so «назад» does not make another copy. `error` is shown to the user.
 */
export async function copyRouteToTrip(routeId: string): Promise<{ error: string }> {
  let id: string | null
  try {
    const loaded = typeof routeId === 'string' ? await loadRoute(routeId) : null
    if (!loaded) return { error: 'Маршрут не найден' }
    id = await createTrip(loaded.route.id, copyRoute(loaded.route, todayIso()))
  } catch (error) {
    console.error(`copyRouteToTrip: ${reason(error)}`)
    return { error: 'Не получилось скопировать маршрут, попробуйте ещё раз' }
  }
  if (!id) redirect(`/login?next=${encodeURIComponent(newTripPath(routeId))}`, RedirectType.replace)
  redirect(tripPath(id), RedirectType.replace)
}

/** Saves the edits of the user's plan; `error` is shown next to «Повторить». */
export async function saveTripEdits(id: string, edits: unknown): Promise<{ error?: string }> {
  try {
    return (await saveTrip(String(id), edits)) ? {} : { error: 'План не найден' }
  } catch (error) {
    console.error(`saveTripEdits: ${reason(error)}`)
    return { error: SAVE_ERROR }
  }
}

/** Deletes the user's plan and refreshes «Мои поездки». */
export async function deleteTripPlan(id: string): Promise<{ error?: string }> {
  try {
    if (!(await deleteTrip(String(id)))) return { error: 'План не найден' }
  } catch (error) {
    console.error(`deleteTripPlan: ${reason(error)}`)
    return { error: 'Не удалось удалить план' }
  }
  refresh()
  return {}
}

const HOTEL_ID = /^[a-z0-9-]{1,80}$/

/**
 * How well the hotels of `hotelId`'s city suit the traveller, 0…1 by id (the embeddings of the hotel and of the
 * traveller's hotels: the plan's, the favourites and the bookings), for `rankHotelAlternatives`. `null` without
 * vectors or on a failure: the replacements are then ranked by their parameters alone.
 */
export async function similarHotelScores(hotelId: string, profile: string[]): Promise<Record<string, number> | null> {
  if (typeof hotelId !== 'string' || !HOTEL_ID.test(hotelId) || !Array.isArray(profile)) return null
  const hits = await similarHotels(
    hotelId,
    profile.filter((id) => typeof id === 'string' && HOTEL_ID.test(id)),
    100,
  )
  if (!hits) return null
  // Cosine scores crowd into a narrow band: spread them over 0…1 within the city.
  const scores = hits.map((hit) => hit.score)
  const [low, high] = [Math.min(...scores), Math.max(...scores)]
  return Object.fromEntries(hits.map((hit) => [hit.id, high > low ? (hit.score - low) / (high - low) : 0.5]))
}
