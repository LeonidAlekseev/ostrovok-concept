import 'server-only'
import { z } from 'zod'
import { anonClient, catalogCached, warnShort } from './anon'
import { CLAIM_SELECT, claimsOf, type HotelClaim } from './claims'

/**
 * What the store of claims knows of many hotels at once, for Эвал's tools of the choice (src/lib/ai/knowledgeTools.ts):
 * the night and day noise levels and the building heights of every hotel (`loadLevelIndex`), the places of a category
 * near every hotel by the edges `near` (`loadNearIndex`), and the claims of the chosen hotels whole, with their sources
 * and calculations (`loadClaimsByIds`). Read with the anon key, as the catalogue, and cached with it: the indexes are a
 * few thousand short rows. A failure reads as `null`: the tool then says it could not read the store.
 */

/** A page of PostgREST's answer: it gives 1000 rows at most. */
const PAGE = 1000
/** Pages at most: no index of the store is near this. */
const MAX_PAGES = 20

/** All the rows of a query, page by page, in a stable order. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) break
  }
  return rows
}

/** A value of a hotel's level: a band of EEA (`min`/`max`, null for an open end) or a number (`value`). */
export interface LevelRow {
  hotelId: string
  property: string
  min: number | null
  max: number | null
  value: number | null
}

const levelRow = z.object({
  property: z.string(),
  value_min: z.number().nullable(),
  value_max: z.number().nullable(),
  value_numeric: z.number().nullable(),
  entity: z.object({ ref: z.string() }),
})

/** The properties of the index: the night bands of EEA, the day estimates, the building's height. */
export const LEVEL_PROPERTIES =
  'property.like.noise.lnight.*,property.like.noise.lday.estimate.*,property.eq.building.height'

const readLevels = catalogCached(['knowledge-levels', 'v1'], async (): Promise<LevelRow[]> => {
  const client = anonClient()
  const rows = await allRows((from, to) =>
    client
      .from('claims')
      .select('id, property, value_min, value_max, value_numeric, entity:entities!inner(kind, ref)')
      .eq('entity.kind', 'hotel')
      .or(LEVEL_PROPERTIES)
      .order('id')
      .range(from, to),
  )
  return rows.flatMap((row) => {
    const parsed = levelRow.safeParse(row)
    if (!parsed.success) return []
    const { property, value_min, value_max, value_numeric, entity } = parsed.data
    return [{ hotelId: entity.ref, property, min: value_min, max: value_max, value: value_numeric }]
  })
})

/** The levels of every hotel of the store; `null` when they cannot be read. */
export async function loadLevelIndex(): Promise<LevelRow[] | null> {
  try {
    return await readLevels()
  } catch (error) {
    warnShort('knowledge levels: none', error)
    return null
  }
}

/** A place near a hotel by the edge `near`: the claim of its distance and what the place is. */
export interface NearRow {
  hotelId: string
  claimId: string
  distanceM: number
  /** The place's name; null for an OSM place without one. */
  name: string | null
  /** `osm_place` or `ota_poi`. */
  kind: string
}

const nearRow = z.object({
  claim: z.object({ id: z.string(), value_numeric: z.number() }),
  subject: z.object({ ref: z.string() }),
  object: z.object({ kind: z.string(), name: z.string().nullable() }).nullable(),
})

/**
 * The method's mark of a category: an OSM place has its categories, a place of Ostrovok its kind (and the categories
 * of the OSM places that are it). A station of Ostrovok of no OSM place is no category: a metro, a tram or a train.
 */
export const OSTROVOK_KIND: Readonly<Record<string, string>> = {
  hospital: 'Больница',
  park: 'Парк',
  beach: 'Пляж',
}

const readNear = catalogCached(['knowledge-near', 'v1'], async (category: string): Promise<NearRow[]> => {
  const client = anonClient()
  const query = (method: Record<string, unknown>) =>
    allRows((from, to) =>
      client
        .from('relations')
        .select(
          'id, claim:claims!inner(id, property, value_numeric, method), ' +
            'subject:entities!relations_subject_id_fkey!inner(kind, ref), ' +
            'object:entities!relations_object_id_fkey(kind, name)',
        )
        .eq('predicate', 'near')
        .eq('subject.kind', 'hotel')
        .eq('claim.property', 'nearby.distance')
        .contains('claim.method', method)
        .order('id')
        .range(from, to),
    )
  const kind = OSTROVOK_KIND[category]
  const answers = await Promise.all([query({ categories: [category] }), ...(kind ? [query({ kind })] : [])])
  const seen = new Set<string>()
  return answers.flat().flatMap((row) => {
    const parsed = nearRow.safeParse(row)
    if (!parsed.success || seen.has(parsed.data.claim.id)) return []
    seen.add(parsed.data.claim.id)
    const { claim, subject, object } = parsed.data
    return [
      {
        hotelId: subject.ref,
        claimId: claim.id,
        distanceM: claim.value_numeric,
        name: object?.name ?? null,
        kind: object?.kind ?? 'osm_place',
      },
    ]
  })
})

/** The places of `category` near every hotel of the store by the edges `near`; `null` when they cannot be read. */
export async function loadNearIndex(category: string): Promise<NearRow[] | null> {
  if (!/^[a-z_]+$/.test(category)) return null
  try {
    return await readNear(category)
  } catch (error) {
    warnShort(`knowledge near ${category}: none`, error)
    return null
  }
}

/** Claims read whole at once at most. */
export const CLAIMS_BY_ID = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The claims of the ids whole — value, status, confidence, sources, calculation — in no order; `[]` for no id, `null`
 * when they cannot be read.
 */
export async function loadClaimsByIds(ids: readonly string[]): Promise<HotelClaim[] | null> {
  const wanted = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, CLAIMS_BY_ID)
  if (wanted.length === 0) return []
  try {
    const { data, error } = await anonClient().from('claims').select(CLAIM_SELECT).in('id', wanted)
    if (error) throw error
    return claimsOf(data ?? [])
  } catch (error) {
    warnShort('knowledge claims: none', error)
    return null
  }
}
