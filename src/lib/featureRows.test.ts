import { describe, expect, it } from 'vitest'
import { diffRows, featureRow, viewRows, type FeatureRow, type ViewRow } from './featureRows'

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
  loudest: {
    Lden: {
      source: 'roadsInAgglomeration',
      db_min: 65,
      db_max: 69,
      band_db: 5,
      category: 'Lden6569',
      dataset: 'eea-noise-end2022-v01_r00',
    },
    Lnight: {
      source: 'roadsInAgglomeration',
      db_min: null,
      db_max: 39,
      band_db: null,
      category: 'LnightLowerThan40',
      dataset: 'eea-noise-end2022-v01_r00',
    },
  },
}

describe('featureRow', () => {
  // geo-data, Requirement: Происхождение значений отеля
  it('keeps the derived values and the sources, the floors rounded', () => {
    expect(featureRow('ota-1', geo)).toEqual({
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
    })
  })

  it('a floor bound of 0 is kept, a negative or missing one is not', () => {
    const building = {
      ...geo.building,
      floors_confidence_lower: 0,
      floors_confidence_upper: 2.5,
      height_confidence_lower: -1,
    }
    expect(featureRow('ota-1', { ...geo, building })).toMatchObject({
      floors_lower: 0,
      floors_upper: 2.5,
      height_lower_m: null,
    })
  })

  it('gives no row outside the data (another city)', () => {
    expect(featureRow('ota-2', { building: null, loudest: {} })).toBeNull()
  })

  it('keeps the noise of a point without a building nearby', () => {
    expect(featureRow('ota-3', { building: null, loudest: { Lnight: geo.loudest.Lnight } })).toMatchObject({
      building_id: null,
      floors: null,
      building_dataset: null,
      height_source: null,
      lnight_max: 39,
      noise_dataset: 'eea-noise-end2022-v01_r00',
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
    const before = featureRow('ota-1', geo)!
    const after: FeatureRow = { ...before, lnight_min: 40, lnight_max: 44 }
    // float4 comes back rounded.
    expect(diffRows([{ ...before, height_m: 25.799999 }], [before], (r) => r.hotel_id).upsert).toEqual([])
    expect(diffRows([before], [after], (r) => r.hotel_id).upsert).toEqual([after])
    expect(diffRows(rows, rows.slice(0, 1), key).remove).toEqual(rows.slice(1))
  })
})
