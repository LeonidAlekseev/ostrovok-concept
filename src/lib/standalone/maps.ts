import 'server-only'

/**
 * The noise and view maps of the standalone demo, put back together from the static files of
 * scripts/export-standalone.ts (`public/standalone/maps`): a hotel's file lists its features by tile and hash, the
 * tiles are shared by the hotels around. Read over the site's own address, as the CDN serves them; the tiles are kept
 * by the instance (the maps never change).
 */

export type MapRoute = 'noise-map' | 'view-map'

type Feature = Record<string, unknown>

const TILES_KEPT = 400
const tiles = new Map<string, Promise<Record<string, Feature> | null>>()

const json = async <T>(url: string): Promise<T | null> => {
  const response = await fetch(url).catch(() => null)
  return response?.ok ? ((await response.json()) as T) : null
}

function tile(origin: string, id: string) {
  let found = tiles.get(id)
  if (!found) {
    found = json<Record<string, Feature>>(`${origin}/standalone/maps/tiles/${id}.json`)
    tiles.set(id, found)
    if (tiles.size > TILES_KEPT) tiles.delete(tiles.keys().next().value!)
  }
  return found
}

/** The ids of the tiles a value needs. */
function tileIds(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) for (const v of value) tileIds(v, into)
  else if (value && typeof value === 'object') {
    const refs = (value as { __features?: unknown }).__features
    if (Array.isArray(refs)) for (const ref of refs) into.add(String(ref).split('/')[0])
    else for (const v of Object.values(value)) tileIds(v, into)
  }
}

function rebuild(value: unknown, byTile: Map<string, Record<string, Feature> | null>): unknown {
  if (Array.isArray(value)) return value.map((v) => rebuild(v, byTile))
  if (!value || typeof value !== 'object') return value
  const refs = (value as { __features?: unknown }).__features
  if (Array.isArray(refs))
    return refs.flatMap((ref) => {
      const [id, hash] = String(ref).split('/')
      const feature = byTile.get(id)?.[hash]
      return feature ? [feature] : []
    })
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebuild(v, byTile)]))
}

/** The route's answer for the hotel as the full version gave it, or `null` when the snapshot has none. */
export async function loadStandaloneMap(origin: string, hotelId: string, route: MapRoute): Promise<unknown> {
  if (!/^ota-\d{1,15}$/.test(hotelId)) return null
  const index = await json<Partial<Record<MapRoute, unknown>>>(`${origin}/standalone/maps/hotels/${hotelId}.json`)
  const answer = index?.[route]
  if (answer === undefined) return null
  const ids = new Set<string>()
  tileIds(answer, ids)
  const byTile = new Map(await Promise.all([...ids].map(async (id) => [id, await tile(origin, id)] as const)))
  return rebuild(answer, byTile)
}
