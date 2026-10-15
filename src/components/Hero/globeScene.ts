import type { Destination } from '../../data/destinations'
import type { NewHotel } from '../../data/hotels'
import { projectToGlobe, type GlobePoint, type GlobeView } from '../../lib/globe'
import { arc, routePath } from './globeGeometry'

/** A recently added hotel highlighted on the globe, with flight routes arriving at its city. */
export interface Spotlight {
  destination: Destination
  hotel: NewHotel
  /** Cities the routes start from. */
  sources: Destination[]
}

export interface Scene {
  points: Map<string, GlobePoint>
  hub: GlobePoint
  routes: { id: string; d: string; opacity: number }[]
}

const routeLift = [0.3, 0.2, 0.25]

/** Fades a marker out as it approaches the limb (depth 0) and hides it behind. */
export const depthOpacity = (depth: number) => Math.min(Math.max((depth - 0.05) / 0.2, 0), 1)

/** Positions of everything on the globe when it is turned to `view`. */
export function sceneAt(markers: Destination[], spotlight: Spotlight, view: GlobeView): Scene {
  const points = new Map(markers.map((d) => [d.id, projectToGlobe(d.lat, d.lon, view)]))
  const project = (d: Destination) => points.get(d.id) ?? projectToGlobe(d.lat, d.lon, view)
  const hub = project(spotlight.destination)
  const routes = spotlight.sources.map((source, i) => {
    const from = project(source)
    return {
      id: source.id,
      d: routePath(arc(source.id, from, hub, routeLift[i % routeLift.length])),
      opacity: depthOpacity(Math.min(from.depth, hub.depth)),
    }
  })
  return { points, hub, routes }
}

/** Cycles through each city's hotels so consecutive visits show different ones. */
export function createHotelFeed(hotels: NewHotel[]) {
  const byCity = new Map<string, NewHotel[]>()
  for (const hotel of hotels) byCity.set(hotel.destinationId, [...(byCity.get(hotel.destinationId) ?? []), hotel])
  const cursor = new Map<string, number>()
  return {
    has: (destinationId: string) => byCity.has(destinationId),
    next(destinationId: string): NewHotel | undefined {
      const list = byCity.get(destinationId)
      if (!list) return undefined
      const i = cursor.get(destinationId) ?? 0
      cursor.set(destinationId, i + 1)
      return list[i % list.length]
    },
  }
}

/** Screen-space limits for a spotlight: the card must clear the text, the faded bottom and the sides. */
export interface Viewport {
  globe: DOMRect
  hero: DOMRect
  /** Text blocks the card must not cover (the title, the hint). */
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
): { city: Destination; sources: Destination[] } | null {
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
  const city = shuffle(fresh.length ? fresh : fits)[0]
  if (!city) return null

  const at = points.get(city.id)!
  const distance = (d: Destination) => Math.hypot(points.get(d.id)!.x - at.x, points.get(d.id)!.y - at.y)
  const nearby = front
    .filter((d) => d !== city && distance(d) > 4)
    .toSorted((a, b) => distance(a) - distance(b))
    .slice(0, 6)
  return { city, sources: shuffle(nearby).slice(0, 3) }
}
