import type { Destination } from '../../data/destinations'
import type { SpotlightHotel } from '../../lib/catalog'
import { globeCities, type GlobeCity } from '../../data/globeCities'
import { projectToGlobe, type GlobePoint, type GlobeView } from '../../lib/globe'

/** A city's new hotel highlighted on the globe. */
export interface Spotlight {
  destination: Destination
  /** The hotel shown: one of the city's new hotels; none in a city without them. */
  hotel: SpotlightHotel | null
}

export interface Scene {
  points: Map<string, GlobePoint>
  hub: GlobePoint
}

/** Fades a marker out as it approaches the limb (depth 0) and hides it behind. */
export const depthOpacity = (depth: number) => Math.min(Math.max((depth - 0.05) / 0.2, 0), 1)

/** Positions of everything on the globe when it is turned to `view`. */
export function sceneAt(markers: Destination[], spotlight: Spotlight, view: GlobeView): Scene {
  const points = new Map(markers.map((d) => [d.id, projectToGlobe(d.lat, d.lon, view)]))
  const { destination } = spotlight
  const hub = points.get(destination.id) ?? projectToGlobe(destination.lat, destination.lon, view)
  return { points, hub }
}

/** Cycles through each city's hotels so consecutive visits show different ones. */
export function createHotelFeed(hotels: readonly SpotlightHotel[]) {
  const byCity = new Map<string, SpotlightHotel[]>()
  for (const hotel of hotels) byCity.set(hotel.destinationId, [...(byCity.get(hotel.destinationId) ?? []), hotel])
  const cursor = new Map<string, number>()
  return {
    has: (destinationId: string) => byCity.has(destinationId),
    /** All the city's hotels, in their order. */
    all: (destinationId: string): SpotlightHotel[] => byCity.get(destinationId) ?? [],
    next(destinationId: string): SpotlightHotel | undefined {
      const list = byCity.get(destinationId)
      if (!list) return undefined
      const i = cursor.get(destinationId) ?? 0
      cursor.set(destinationId, i + 1)
      return list[i % list.length]
    },
  }
}

/** A random item of `list`, other than `previousId` while there is a choice; `random` as Math.random(). */
export function pickOther<T extends { id: string }>(
  list: readonly T[],
  previousId?: string,
  random: () => number = Math.random,
): T | undefined {
  const choice = list.length > 1 ? list.filter((item) => item.id !== previousId) : list
  return choice[Math.floor(random() * choice.length)]
}

/** Screen-space limits for a spotlight: the card must clear the text, the faded bottom and the sides. */
export interface Viewport {
  globe: DOMRect
  hero: DOMRect
  /** Text blocks the card must not cover (the title). */
  avoid: DOMRect[]
  /** Edges of the place card relative to its pin, px (the CSS decides where the card sits). */
  card: { left: number; right: number; top: number; bottom: number }
}

const shuffle = <T>(list: T[]) => list.toSorted(() => Math.random() - 0.5)

/**
 * Picks the next city to spotlight among those comfortably in view, preferring the left
 * side (the globe turns them rightwards, so they stay in view longest) and skipping `recent`.
 */
export function pickSpotlightCity(
  markers: Destination[],
  points: Map<string, GlobePoint>,
  view: Viewport,
  recent: string[],
): Destination | null {
  const screen = (p: GlobePoint) => ({
    x: view.globe.left + (p.x / 100) * view.globe.width,
    y: view.globe.top + (p.y / 100) * view.globe.height,
  })
  const front = markers.filter((d) => points.get(d.id)!.depth > 0.4)
  const fits = front.filter((d) => {
    const { x, y } = screen(points.get(d.id)!)
    return (
      // Margins leave room for hotel names longer than the current one.
      x + view.card.left > view.hero.left + 12 &&
      x + view.card.right + 32 < view.hero.right &&
      x < view.hero.left + view.hero.width * 0.65 &&
      y < view.hero.bottom - view.hero.height * 0.32 &&
      y + view.card.bottom < view.hero.bottom - view.hero.height * 0.28 &&
      view.avoid.every(
        (r) =>
          x + view.card.left > r.right + 8 ||
          x + view.card.right < r.left - 8 ||
          y + view.card.top > r.bottom + 8 ||
          y + view.card.bottom < r.top - 8,
      )
    )
  })
  const fresh = fits.filter((d) => !recent.includes(d.id))
  return shuffle(fresh.length ? fresh : fits)[0] ?? null
}

/** The city dot nearest to (x, y) within `radius`, all in CSS pixels from the globe's top left; `size` is the globe's side. */
export function cityAt(view: GlobeView, x: number, y: number, size: number, radius: number): GlobeCity | null {
  let best: GlobeCity | null = null
  let bestDistance = radius
  for (const city of globeCities) {
    const p = projectToGlobe(city.lat, city.lon, view)
    if (p.depth <= 0.05) continue
    const distance = Math.hypot((p.x * size) / 100 - x, (p.y * size) / 100 - y)
    if (distance < bestDistance) {
      best = city
      bestDistance = distance
    }
  }
  return best
}
