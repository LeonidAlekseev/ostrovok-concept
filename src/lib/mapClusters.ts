/**
 * Groups of the results map: hotels whose price markers would stand closer than `CLUSTER_RADIUS`
 * pixels at the current zoom share one marker, "4 от 8 000 ₽".
 */

export interface MapPoint {
  hotel: { id: string; lon: number; lat: number }
  price: number
}

export interface MapCluster<T extends MapPoint> {
  /** The hotel id of a single marker; the ids of a group otherwise. Stable while the members are. */
  key: string
  members: T[]
  lon: number
  lat: number
  /** The cheapest price among the members. */
  price: number
}

/** Markers closer than this many screen pixels are grouped. */
export const CLUSTER_RADIUS = 48
/** The zoom a group may expand to at most: hotels on one spot never part. */
export const MAX_CLUSTER_ZOOM = 18

/** MapLibre's vector tiles are 512 px: the world is this wide at zoom 0. */
const WORLD = 512

/** Web Mercator pixel coordinates of a point at `zoom`. */
export function project(lon: number, lat: number, zoom: number): [number, number] {
  const size = WORLD * 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size]
}

/**
 * Groups the points at `zoom`: each point, in the order of its id so the groups do not depend on the
 * sorting of the list, takes the free points within the radius around it. A group stands at the mean
 * position of its members.
 */
export function clusterPoints<T extends MapPoint>(
  points: readonly T[],
  zoom: number,
  radius = CLUSTER_RADIUS,
): MapCluster<T>[] {
  const placed = [...points]
    .sort((a, b) => (a.hotel.id < b.hotel.id ? -1 : a.hotel.id > b.hotel.id ? 1 : 0))
    .map((point) => ({ point, at: project(point.hotel.lon, point.hotel.lat, zoom) }))
  const taken = new Set<T>()
  const clusters: MapCluster<T>[] = []
  for (const seed of placed) {
    if (taken.has(seed.point)) continue
    const members = placed
      .filter(({ point, at }) => !taken.has(point) && Math.hypot(at[0] - seed.at[0], at[1] - seed.at[1]) < radius)
      .map(({ point }) => point)
    for (const member of members) taken.add(member)
    clusters.push({
      key: members.map((m) => m.hotel.id).join('+'),
      members,
      lon: members.reduce((sum, m) => sum + m.hotel.lon, 0) / members.length,
      lat: members.reduce((sum, m) => sum + m.hotel.lat, 0) / members.length,
      price: Math.min(...members.map((m) => m.price)),
    })
  }
  return clusters
}

/** The first whole zoom above `zoom` at which the group parts, at most `MAX_CLUSTER_ZOOM`. */
export function expansionZoom(members: readonly MapPoint[], zoom: number): number {
  for (let next = Math.floor(zoom) + 1; next < MAX_CLUSTER_ZOOM; next++)
    if (clusterPoints(members, next).length > 1) return next
  return MAX_CLUSTER_ZOOM
}
