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
export const PERSONA_HOTELS = 3

/** The only city of the selections: the one whose catalogue is real. */
export const PERSONA_CITY = 'valencia'

/** Which hotels suit a persona, and which of them come first: each tab by its theme, ties by the guests' rating. */
const priced = (h: Hotel) => h.priceFrom > 0
const RULES: Record<Persona, { fits: (h: Hotel) => boolean; order: (a: Hotel, b: Hotel) => number }> = {
  student: { fits: priced, order: (a, b) => a.priceFrom - b.priceFrom || b.rating - a.rating },
  luxury: { fits: priced, order: (a, b) => b.priceFrom - a.priceFrom || b.rating - a.rating },
  workation: {
    fits: (h) => h.workspace,
    order: (a, b) => (b.wifiMbps ?? 0) - (a.wifiMbps ?? 0) || b.rating - a.rating,
  },
  culture: { fits: () => true, order: (a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating },
}

/**
 * The persona's selection: the hotels of `PERSONA_CITY` that suit it in its order, up to `PERSONA_HOTELS`;
 * ties keep the catalogue order, so the same catalogue gives the same selection.
 */
export function personaHotels(hotels: readonly Hotel[], persona: Persona): Hotel[] {
  const { fits, order } = RULES[persona]
  return hotels
    .filter((h) => h.destinationId === PERSONA_CITY && fits(h))
    .toSorted(order)
    .slice(0, PERSONA_HOTELS)
}
