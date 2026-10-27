/**
 * The policy of the confidence of the claims (hotel-knowledge, «Политика уверенности»): how much a claim may be
 * trusted, from 0 to 1, by where it comes from and how it was computed. A claim reported or observed by a source has
 * the source's confidence (`SOURCE_CONFIDENCE`); a computed one, the least confidence of its inputs less the penalty
 * of each assumption it makes (`ASSUMPTION_PENALTY`): a calculation is never surer than what it reads. `CONFIDENCE`
 * is the rule applied to each kind of claim `npm run db:features` writes; the claim's `method.confidence` names the
 * policy's version and the rule, so a later policy tells its claims from the old ones. No `server-only`: the script
 * builds the rows with it.
 */

export const CONFIDENCE_POLICY = 'confidence-1'

/** How much each source is trusted. */
export const SOURCE_CONFIDENCE = {
  /** Ostrovok's own data: the page's facts, its places and the distances to them, the names of the rooms. */
  ostrovok: 1,
  /** Where an element of OpenStreetMap is: its coordinates and shape, as mapped. */
  osm: 1,
  /** EEA's strategic noise map: a model of the 2022 round, in bands of 5 dB, not a measurement. */
  eea: 0.9,
  /** EUBUCCO's buildings: heights and floors partly estimated by its model. */
  eubucco: 0.9,
  /** A guest's words in a review: what one guest heard, once. */
  review: 0.75,
  /** A hotel owner's answer (none yet): the owner knows the hotel but speaks for it. */
  owner: 0.75,
  /** A conclusion of a language model. */
  model: 0.5,
} as const

export type ConfidenceSource = keyof typeof SOURCE_CONFIDENCE

/** What a calculation takes for granted, and how much it costs it. */
export const ASSUMPTION_PENALTY = {
  /** OSM has every place of the category around: a place missing from it is missing from the count. */
  osm_complete: 0.1,
  /** Lday from Lden and Lnight: the evening is as loud as the day. */
  evening_equals_day: 0.05,
  /** Lday from Lden and Lnight: the day is not quieter than the night. */
  day_not_quieter_than_night: 0.05,
  /**
   * noise-estimate-v1: a loud place of OSM is as loud as the reference level of its kind at 10 m (a typical terrace
   * or open door, not a measurement of the place), open in the periods of its kind.
   */
  venue_reference_level: 0.2,
  /** noise-estimate-v1: a place is a point source in the open — the level falls by 20·lg(d/10), no building screens it. */
  point_source_no_screening: 0.1,
} as const

export type Assumption = keyof typeof ASSUMPTION_PENALTY

export interface ConfidenceRule {
  /** The sources the value rests on: one for a reported or observed value, all the inputs of a calculation. */
  inputs: readonly ConfidenceSource[]
  assumptions: readonly Assumption[]
}

/** The rule's confidence: the least of its inputs less its assumptions, to 0.01, never below 0. */
export function confidenceOf({ inputs, assumptions }: ConfidenceRule): number {
  if (inputs.length === 0) throw new Error('A confidence needs an input')
  const least = Math.min(...inputs.map((source) => SOURCE_CONFIDENCE[source]))
  const penalty = assumptions.reduce((sum, a) => sum + ASSUMPTION_PENALTY[a], 0)
  return Math.max(0, Math.round((least - penalty) * 100) / 100)
}

/** The rule of each kind of claim. */
export const CONFIDENCE_RULES = {
  /** A fact of the hotel's page (none in the store yet). */
  ostrovok_fact: { inputs: ['ostrovok'], assumptions: [] },
  /** A place of Ostrovok near the hotel and its distance, as the page gives it. */
  ostrovok_place_distance: { inputs: ['ostrovok'], assumptions: [] },
  /** A view from a room by the name of its group (none in the store yet). */
  room_name_view: { inputs: ['ostrovok'], assumptions: [] },
  /** Where an OSM place is (`observed`; none in the store yet). */
  osm_place: { inputs: ['osm'], assumptions: [] },
  /** A band of EEA's map at the hotel's point. */
  eea_band: { inputs: ['eea'], assumptions: [] },
  /** The height and the floors of a building of EUBUCCO. */
  eubucco_building: { inputs: ['eubucco'], assumptions: [] },
  /** A guest's mention of noise or quiet. */
  review_mention: { inputs: ['review'], assumptions: [] },
  /** A hotel owner's answer (none yet). */
  owner_answer: { inputs: ['owner'], assumptions: [] },
  /** The distance from the hotel's point (Ostrovok) to the shape of an OSM place. */
  osm_distance: { inputs: ['ostrovok', 'osm'], assumptions: [] },
  /** The count of the loud OSM places of a category around the hotel. */
  osm_count: { inputs: ['ostrovok', 'osm'], assumptions: ['osm_complete'] },
  /** The distance from the hotel's point to the nearest building of EUBUCCO. */
  building_distance: { inputs: ['ostrovok', 'eubucco'], assumptions: [] },
  /** Lday from the bands of Lden and Lnight. */
  day_estimate: { inputs: ['eea'], assumptions: ['evening_equals_day', 'day_not_quieter_than_night'] },
  /** noise-estimate-v1: the EEA bands at the facade (the building's contour of EUBUCCO widened), Lden and Lnight. */
  facade_band: { inputs: ['eea', 'eubucco'], assumptions: [] },
  /** noise-estimate-v1: Lday and Levening at the facade from the bands of Lden and Lnight. */
  facade_day: { inputs: ['eea', 'eubucco'], assumptions: ['evening_equals_day', 'day_not_quieter_than_night'] },
  /** noise-estimate-v1: the level the loud OSM places give at the hotel. */
  venue_level: {
    inputs: ['ostrovok', 'osm'],
    assumptions: ['osm_complete', 'venue_reference_level', 'point_source_no_screening'],
  },
  /** noise-estimate-v1: the facade and the places summed, Lnight and Lden. */
  noise_estimate: {
    inputs: ['eea', 'eubucco', 'ostrovok', 'osm'],
    assumptions: ['osm_complete', 'venue_reference_level', 'point_source_no_screening'],
  },
  /** noise-estimate-v1: the facade and the places summed, Lday and Levening. */
  noise_estimate_day: {
    inputs: ['eea', 'eubucco', 'ostrovok', 'osm'],
    assumptions: [
      'osm_complete',
      'venue_reference_level',
      'point_source_no_screening',
      'evening_equals_day',
      'day_not_quieter_than_night',
    ],
  },
  /** noise-estimate-v1 without a loud place in OSM around: the facade alone, if OSM misses none. */
  noise_estimate_no_places: { inputs: ['eea', 'eubucco', 'ostrovok', 'osm'], assumptions: ['osm_complete'] },
  /** The same, Lday and Levening. */
  noise_estimate_no_places_day: {
    inputs: ['eea', 'eubucco', 'ostrovok', 'osm'],
    assumptions: ['osm_complete', 'evening_equals_day', 'day_not_quieter_than_night'],
  },
  /** A conclusion of a language model. */
  inferred: { inputs: ['model'], assumptions: [] },
} as const satisfies Record<string, ConfidenceRule>

export type ConfidenceKind = keyof typeof CONFIDENCE_RULES

/** The confidence of each kind of claim. */
export const CONFIDENCE = Object.fromEntries(
  Object.entries(CONFIDENCE_RULES).map(([kind, rule]) => [kind, confidenceOf(rule)]),
) as Record<ConfidenceKind, number>

/** The claim's confidence and what its `method.confidence` records: the policy's version and the rule. */
export const confidenceFor = (kind: ConfidenceKind) => ({
  confidence: CONFIDENCE[kind],
  method: { policy: CONFIDENCE_POLICY, rule: kind },
})
