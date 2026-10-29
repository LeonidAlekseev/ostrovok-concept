import { describe, expect, it } from 'vitest'
import { diffRows, featureRow, viewRows, type FeatureRow, type ViewRow } from './featureRows'
import { noiseEstimate, type HotelNoise } from './noise'

const geo = {
  building: {
    id: 'b-1',
    type: 'residential',
    height: 25.8,
    floors: 9.6,
    distance_m: 6.9,
    dataset: 'eubucco-v0.2',
    geometry_source: 'gov-spain',
    height_source: 'estimated',
    height_confidence_lower: 21.1,
    height_confidence_upper: 30.4,
    floors_source: 'gov-spain',
    floors_confidence_lower: null,
    floors_confidence_upper: null,
  },
  noise: [],
}

/** The facade of the hotel: the roads to the street, the estimate of noise-estimate-v2 from them and a bar. */
const sources: HotelNoise['sources'] = [
  { source: 'roadsInAgglomeration', lden: { min: 65, max: 69 }, lnight: { max: 39 } },
  { source: 'industryInAgglomeration', lden: { max: 39 } },
]
const facadeNoise: HotelNoise = {
  sources,
  yard: [{ source: 'roadsInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } }],
  zone: { kind: 'building', buildingId: 'b-1', bufferM: 5 },
  places: [{ category: 'bar', name: 'Homenaje', distanceM: 40, lat: 0, lon: 0 }],
  placesCovered: [],
}
const estimate = noiseEstimate(facadeNoise)!
const facade = { sources, dataset: 'eea-noise-end2022-v01_r00', estimate }
const round = (value: number) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null)

describe('featureRow', () => {
  it('keeps the answer of the facade function in the row', () => {
    const answer = { zone: { kind: 'circle', radius_m: 25 }, bands: [] }
    expect(featureRow('ota-1', geo, { ...facade, answer })?.noise_facade).toEqual(answer)
  })

  // geo-data, Requirement: Происхождение значений отеля; hotel-knowledge, Requirement: Оценка шума у фасада
  it('keeps the derived values and the sources, the floors rounded, the loudest band and the estimate at the facade', () => {
    expect(featureRow('ota-1', geo, facade)).toEqual({
      hotel_id: 'ota-1',
      building_id: 'b-1',
      height_m: 25.8,
      floors: 10,
      lden_min: 65,
      lden_max: 69,
      lden_source: 'roadsInAgglomeration',
      lnight_min: null,
      lnight_max: 39,
      lnight_source: 'roadsInAgglomeration',
      building_dataset: 'eubucco-v0.2',
      geometry_source: 'gov-spain',
      height_source: 'estimated',
      height_lower_m: 21.1,
      height_upper_m: 30.4,
      floors_source: 'gov-spain',
      floors_lower: null,
      floors_upper: null,
      noise_dataset: 'eea-noise-end2022-v01_r00',
      noise_method: 'noise-estimate-v2',
      noise_zone: 'building',
      noise_facade: null,
      street_lday_min: round(estimate.street.lday!.min),
      street_lday_max: round(estimate.street.lday!.max),
      street_lnight_min: round(estimate.street.lnight!.min),
      street_lnight_max: round(estimate.street.lnight!.max),
      yard_lday_min: round(estimate.yard.lday!.min),
      yard_lday_max: round(estimate.yard.lday!.max),
      yard_lnight_min: round(estimate.yard.lnight!.min),
      yard_lnight_max: round(estimate.yard.lnight!.max),
    })
    // The yard is the roads below 40 dB alone: the building screens the bar at 40 m from it.
    expect(round(estimate.yard.lnight!.min)).toBeNull()
    expect(round(estimate.yard.lnight!.max)).toBe(40)
  })

  it('a floor bound of 0 is kept, a negative or missing one is not', () => {
    const building = {
      ...geo.building,
      floors_confidence_lower: 0,
      floors_confidence_upper: 2.5,
      height_confidence_lower: -1,
    }
    expect(featureRow('ota-1', { ...geo, building }, facade)).toMatchObject({
      floors_lower: 0,
      floors_upper: 2.5,
      height_lower_m: null,
    })
  })

  it('gives no row outside the data (another city)', () => {
    expect(featureRow('ota-2', { building: null }, { sources: [], dataset: null, estimate: null })).toBeNull()
  })

  it('keeps the noise of a point without a building nearby', () => {
    expect(
      featureRow(
        'ota-3',
        { building: null },
        { sources: [{ source: 'roadsInAgglomeration', lnight: { max: 39 } }], dataset: facade.dataset, estimate: null },
      ),
    ).toMatchObject({
      building_id: null,
      floors: null,
      building_dataset: null,
      height_source: null,
      lnight_max: 39,
      noise_dataset: 'eea-noise-end2022-v01_r00',
      noise_method: null,
      street_lnight_max: null,
    })
  })
})

describe('viewRows', () => {
  it('one row a view of a room_group_id, the first record of the id carrying the rg_hash', () => {
    expect(
      viewRows(7, [
        { rg_hash: 'r1', room_group_id: 5, name_struct: { main_name: 'Люкс с видом на море' } },
        { rg_hash: 'r2', room_group_id: 5, name_struct: { main_name: 'Люкс с видом на море, 2 кровати' } },
        { rg_hash: 'r3', room_group_id: 6, name_struct: { main_name: 'Люкс с видом на море' } },
        { rg_hash: 'r4', room_group_id: 5, name_struct: { main_name: 'Люкс с видом на город' } },
      ]),
    ).toEqual([
      { hotel_id: 'ota-7', master_id: 7, rg_hash: 'r1', view: 'sea' },
      { hotel_id: 'ota-7', master_id: 7, rg_hash: 'r3', view: 'sea' },
      { hotel_id: 'ota-7', master_id: 7, rg_hash: 'r4', view: 'city' },
    ])
  })

  it('a row a view of a room group, without the name', () => {
    expect(
      viewRows(7, [
        { rg_hash: 'r1', name_struct: { main_name: 'Люкс с балконом и с видом на море' } },
        { rg_hash: 'r1', name_struct: { main_name: 'Люкс с балконом и с видом на море' } },
        { rg_hash: 'r2', name_struct: { main_name: 'Номер с балконом' } },
        { rg_hash: 'r3', name_struct: { main_name: 'Номер с видом на город' } },
        { name_struct: { main_name: 'Номер с видом на парк' } },
      ]),
    ).toEqual([
      { hotel_id: 'ota-7', master_id: 7, rg_hash: 'r1', view: 'sea' },
      { hotel_id: 'ota-7', master_id: 7, rg_hash: 'r3', view: 'city' },
    ])
  })
})

// assistant-search, Requirement: Свойства отелей без дублирования
describe('diffRows', () => {
  const key = (row: ViewRow) => `${row.hotel_id}:${row.rg_hash}:${row.view}`
  const rows: ViewRow[] = viewRows(7, [
    { rg_hash: 'r1', name_struct: { main_name: 'Люкс с видом на море' } },
    { rg_hash: 'r3', name_struct: { main_name: 'Номер с видом на город' } },
  ])

  it('writes nothing on a second run over the same data (Scenario: Повторный расчёт)', () => {
    const first = diffRows([], rows, key)
    expect(first).toEqual({ upsert: rows, remove: [] })
    expect(diffRows(first.upsert, rows, key)).toEqual({ upsert: [], remove: [] })
  })

  it('deletes the rows gone from the data and rewrites the changed ones', () => {
    const before = featureRow('ota-1', geo, facade)!
    const after: FeatureRow = { ...before, lnight_min: 40, lnight_max: 44 }
    // float4 comes back rounded.
    expect(diffRows([{ ...before, height_m: 25.799999 }], [before], (r) => r.hotel_id).upsert).toEqual([])
    expect(diffRows([before], [after], (r) => r.hotel_id).upsert).toEqual([after])
    expect(diffRows(rows, rows.slice(0, 1), key).remove).toEqual(rows.slice(1))
  })

  it('compares jsonb deeply: the order of keys does not rewrite, a changed value does', () => {
    const row = (value: unknown) => [{ id: 'a', data: value }]
    const id = (r: { id: string }) => r.id
    const a = { x: 1, y: [{ p: 1, q: 2 }], z: null }
    expect(diffRows(row(a), row({ z: null, y: [{ q: 2, p: 1 }], x: 1 }), id).upsert).toEqual([])
    expect(diffRows(row(a), row({ ...a, y: [{ p: 1, q: 3 }] }), id).upsert).toHaveLength(1)
    expect(diffRows(row(a), row({ ...a, y: [] }), id).upsert).toHaveLength(1)
    expect(diffRows(row(a), row({ x: 1, y: a.y }), id).upsert).toHaveLength(1)
    expect(diffRows(row(null), row({}), id).upsert).toHaveLength(1)
  })
})
