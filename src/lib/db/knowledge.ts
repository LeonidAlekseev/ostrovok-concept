import 'server-only'
import { z } from 'zod'
import type { HotelPoint } from './anon'
import { anonClient, catalogCached, readOrNull, warnShort } from './anon'
import { claimsOf, evidenceOf, type ClaimEvidence, type HotelClaim } from './claims'

/**
 * The graph of the store of claims, read with the anon key as `claims.ts` does, in two parts:
 * - the graph of one real hotel for the public read routes (`loadHotelRelations`);
 * - the indexes of every hotel at once for Эвал's tools of the choice (src/lib/ai/knowledgeTools.ts): the night and day
 *   noise levels and the building heights (`loadLevelIndex`), the places of a category near each hotel by the edges
 *   `near` (`loadNearIndex`), and the claims of the chosen hotels whole by their ids (`loadClaimsByIds`). The indexes
 *   are a few thousand short rows, cached with the catalogue; a failure reads as `null`.
 *
 * The graph of a real hotel for the public read routes (`GET /api/hotels/{hotelId}/relations`): its edges
 * (`relations`: `near` a place, `nearest_building` a building) with the claim that is the edge's value (the distance)
 * and the edge's source, read with the anon key as `claims.ts` does. The store keeps no coordinates of a place, so they
 * and its categories come from the OSM cache (`osm_places_near`) the edge was computed from.
 */

/** Edges at most read from the store for a hotel: it has a few dozen. */
export const RELATIONS_LIMIT = 500

export interface PlaceSpot {
  lat: number
  lon: number
  categories: string[]
}

export interface HotelRelation {
  id: string
  predicate: string
  confidence: number | null
  object: {
    kind: string
    ref: string
    name: string | null
    /** `null` for a building, or a place the OSM cache no longer shows. */
    lat: number | null
    lon: number | null
    categories: string[]
  }
  /** The edge's value, e.g. the distance. */
  claim: HotelClaim | null
  evidence: ClaimEvidence | null
}

const relationRow = z.object({
  id: z.string(),
  predicate: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  object: z.object({ kind: z.string(), ref: z.string(), name: z.string().nullable() }),
  claim: z.unknown(),
  evidence: z.unknown(),
})

const CLAIM_COLUMNS =
  'id, property, source_key, value_numeric, value_min, value_max, value_text, value_boolean, value_json, unit, ' +
  'epistemic_status, confidence, method, observed_at, valid_from, valid_to, limitations, ' +
  'calculation:calculations(id, method, version, inputs, parameters, limitations, computed_at), ' +
  'claim_evidence(role, evidence(id, type, title, provider, external_id, url, retrieved_at, excerpt, dataset_id))'
const EVIDENCE_COLUMNS = 'id, type, title, provider, external_id, url, retrieved_at, excerpt, dataset_id, metadata'

const RELATION_SELECT =
  `id, predicate, confidence, object:entities!relations_object_id_fkey(kind, ref, name), ` +
  `claim:claims(${CLAIM_COLUMNS}), evidence(${EVIDENCE_COLUMNS}), subject:entities!relations_subject_id_fkey!inner(kind, ref)`

const metadataCategories = (value: unknown): string[] => {
  const categories = value && typeof value === 'object' ? (value as { categories?: unknown }).categories : null
  return Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string') : []
}

const spotRow = z.object({
  osm_type: z.string(),
  osm_id: z.number(),
  lat: z.number(),
  lon: z.number(),
  categories: z.array(z.string()),
})

const readRelations = catalogCached(
  ['hotel-relations', 'v1'],
  async (hotelId: string, lat: number, lon: number, predicate: string) => {
    const client = anonClient()
    const query = client
      .from('relations')
      .select(RELATION_SELECT)
      .eq('subject.kind', 'hotel')
      .eq('subject.ref', hotelId)
      .limit(RELATIONS_LIMIT)
    const { data, error } = await (predicate ? query.eq('predicate', predicate) : query)
    if (error) throw error

    const rows = (data ?? []).flatMap((value) => {
      const parsed = relationRow.safeParse(value)
      return parsed.success ? [parsed.data] : []
    })
    const sources = rows.map(({ evidence }) => ({
      evidence: evidenceOf(evidence ? [evidence] : [])[0] ?? null,
      categories: metadataCategories((evidence as { metadata?: unknown } | null)?.metadata),
    }))
    const claims = rows.map(({ claim }) => claimsOf(claim ? [claim] : [])[0] ?? null)

    // The places' points and categories: the cache the edges were computed from, around the hotel.
    const spots = new Map<string, PlaceSpot>()
    const wanted = [...new Set(sources.flatMap(({ categories }) => categories))]
    const places = rows.filter(({ object }) => object.kind === 'osm_place')
    if (wanted.length > 0 && places.length > 0) {
      const radius = Math.max(1, ...claims.map((c) => (c?.value.kind === 'number' ? c.value.value : 0))) + 1
      const { data: near, error: nearError } = await client.rpc('osm_places_near', {
        lat,
        lon,
        radius_m: radius,
        wanted,
        per_category: 20,
      })
      if (nearError) throw nearError
      const list = (near as { places?: unknown } | null)?.places
      for (const item of Array.isArray(list) ? list : []) {
        const spot = spotRow.safeParse(item)
        if (spot.success)
          spots.set(`${spot.data.osm_type}/${spot.data.osm_id}`, {
            lat: spot.data.lat,
            lon: spot.data.lon,
            categories: spot.data.categories,
          })
      }
    }

    return rows.map(({ id, predicate: name, confidence, object }, i): HotelRelation => {
      const spot = spots.get(object.ref)
      return {
        id,
        predicate: name,
        confidence,
        object: {
          ...object,
          lat: spot?.lat ?? null,
          lon: spot?.lon ?? null,
          categories: spot?.categories ?? sources[i].categories,
        },
        claim: claims[i],
        evidence: sources[i].evidence,
      }
    })
  },
)

const distanceOf = (relation: HotelRelation) =>
  relation.claim?.value.kind === 'number' ? relation.claim.value.value : Number.POSITIVE_INFINITY

/**
 * The edges of the real hotel, the nearest first, of the `predicate` (all when empty) and of the place `category`
 * (all when empty); `[]` when it has none (which says nothing of the hotel), `null` when they cannot be read.
 */
export async function loadHotelRelations(
  hotel: HotelPoint,
  { predicate = '', category = '' }: { predicate?: string; category?: string } = {},
): Promise<HotelRelation[] | null> {
  const all = await readOrNull(hotel.id, 'hotel relations', () =>
    readRelations(hotel.id, hotel.lat, hotel.lon, predicate),
  )
  if (!all) return all
  return all
    .filter((r) => !category || r.object.categories.includes(category))
    .sort((a, b) => distanceOf(a) - distanceOf(b) || a.object.ref.localeCompare(b.object.ref))
}

// ——— The indexes of every hotel, for the tools of the choice ———

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

/** The properties of the index: the night and the day at the facade to the street (noise-estimate-v1), the height. */
export const LEVEL_PROPERTIES =
  'property.eq.noise.estimate.street.lnight,property.eq.noise.estimate.street.lday,property.eq.building.height'

const readLevels = catalogCached(['knowledge-levels', 'v2'], async (): Promise<LevelRow[]> => {
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
    const { data, error } = await anonClient().from('claims').select(CLAIM_COLUMNS).in('id', wanted)
    if (error) throw error
    return claimsOf(data ?? [])
  } catch (error) {
    warnShort('knowledge claims: none', error)
    return null
  }
}
