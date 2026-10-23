import type { Hotel } from './catalog'

/** Who travels: the tabs of the home page's selections of hotels. */
export const PERSONAS = ['student', 'luxury', 'workation', 'culture'] as const
export type Persona = (typeof PERSONAS)[number]

export const PERSONA_LABEL: Record<Persona, string> = {
  student: 'Студент',
  luxury: 'Люкс',
  workation: 'Воркейшн',
  culture: 'Культура',
}

/** Hotels of one persona's selection. */
export const PERSONA_HOTELS = 6

/** Which hotels suit a persona, and which of them come first. */
const RULES: Record<Persona, { fits: (h: Hotel) => boolean; order: (a: Hotel, b: Hotel) => number }> = {
  student: { fits: (h) => h.rating >= 7, order: (a, b) => a.priceFrom - b.priceFrom },
  luxury: { fits: (h) => h.stayType === 'hotel' && h.stars === 5, order: (a, b) => b.rating - a.rating },
  workation: { fits: (h) => h.workspace, order: (a, b) => b.wifiMbps - a.wifiMbps },
  culture: { fits: (h) => h.rating >= 8, order: (a, b) => a.distanceKm - b.distanceKm },
}

/**
 * The persona's selection: the hotels that suit it in its order, one a city, up to `PERSONA_HOTELS`;
 * ties keep the catalogue order, so the same catalogue gives the same selection.
 */
export function personaHotels(hotels: readonly Hotel[], persona: Persona): Hotel[] {
  const { fits, order } = RULES[persona]
  const cities = new Set<string>()
  const picks: Hotel[] = []
  for (const hotel of hotels.filter(fits).toSorted(order)) {
    if (picks.length >= PERSONA_HOTELS) break
    if (cities.has(hotel.destinationId)) continue
    cities.add(hotel.destinationId)
    picks.push(hotel)
  }
  return picks
}
