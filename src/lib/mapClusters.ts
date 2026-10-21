/**
 * Groups of the results map: hotels whose price markers would overlap at the current zoom, standing
 * closer than `CLUSTER_SPAN` pixels across and down, share one marker, "4 от 8 000 ₽".
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

/**
 * Markers closer than this many screen pixels across and down are grouped: a price marker is wide
 * and low, so a round radius would either leave wide labels overlapping or group markers one above the other.
 */
export const CLUSTER_SPAN = { x: 120, y: 32 } as const
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
 * Groups the points at `zoom`: while two markers stand within the span of each other, they merge into
 * one group at the mean position of its members. Points are taken in the order of their id, so the
 * groups do not depend on the sorting of the list.
 */
export function clusterPoints<T extends MapPoint>(points: readonly T[], zoom: number): MapCluster<T>[] {
  const groups = [...points]
    .sort((a, b) => (a.hotel.id < b.hotel.id ? -1 : a.hotel.id > b.hotel.id ? 1 : 0))
    .map((point) => ({ members: [point], at: project(point.hotel.lon, point.hotel.lat, zoom) }))
  const near = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < CLUSTER_SPAN.x && Math.abs(a[1] - b[1]) < CLUSTER_SPAN.y
  const mean = (members: T[], of: (point: T) => number) => members.reduce((sum, m) => sum + of(m), 0) / members.length
  for (let merged = true; merged;) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i++)
      for (let j = i + 1; j < groups.length && !merged; j++) {
        if (!near(groups[i].at, groups[j].at)) continue
        const members = [...groups[i].members, ...groups[j].members]
        const at = project(
          mean(members, (m) => m.hotel.lon),
          mean(members, (m) => m.hotel.lat),
          zoom,
        )
        groups[i] = { members, at }
        groups.splice(j, 1)
        merged = true
      }
  }
  return groups.map(({ members }) => ({
    key: members
      .map((m) => m.hotel.id)
      .sort()
      .join('+'),
    members,
    lon: mean(members, (m) => m.hotel.lon),
    lat: mean(members, (m) => m.hotel.lat),
    price: Math.min(...members.map((m) => m.price)),
  }))
}

/** The first whole zoom above `zoom` at which the group parts, at most `MAX_CLUSTER_ZOOM`. */
export function expansionZoom(members: readonly MapPoint[], zoom: number): number {
  for (let next = Math.floor(zoom) + 1; next < MAX_CLUSTER_ZOOM; next++)
    if (clusterPoints(members, next).length > 1) return next
  return MAX_CLUSTER_ZOOM
}
