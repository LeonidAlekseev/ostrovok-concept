import 'server-only'
import { z } from 'zod'
import type { HotelPoint } from './anon'
import { anonClient, catalogCached, readOrNull } from './anon'
import { claimsOf, evidenceOf, type ClaimEvidence, type HotelClaim } from './claims'

/**
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
