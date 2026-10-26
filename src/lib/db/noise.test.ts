import { describe, expect, it } from 'vitest'
import { noiseMapOf, placesOf, sourcesOf } from './noise'

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('sourcesOf', () => {
  it('folds the rows of hotel_geo into the layers with their Lden and Lnight', () => {
    expect(
      sourcesOf([
        { source: 'industryInAgglomeration', indicator: 'Lden', db_min: null, db_max: 39 },
        { source: 'roadsInAgglomeration', indicator: 'Lden', db_min: 60, db_max: 64 },
        { source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 50, db_max: 54 },
        { source: 'majorRoadsIncludingAgglomeration', indicator: 'Lden', db_min: 75, db_max: null },
        { source: 'broken', indicator: 'Lday', db_min: 60, db_max: 64 },
      ]),
    ).toEqual([
      { source: 'majorRoadsIncludingAgglomeration', lden: { min: 75 } },
      { source: 'roadsInAgglomeration', lden: { min: 60, max: 64 }, lnight: { min: 50, max: 54 } },
      { source: 'industryInAgglomeration', lden: { max: 39 } },
    ])
  })
})

describe('noiseMapOf', () => {
  it('keeps the noise contours with rounded coordinates and drops the buildings', () => {
    const map = noiseMapOf([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.3763214, 39.4699187],
              [-0.37, 39.47],
              [-0.371, 39.471],
            ],
          ],
        },
        properties: { layer: 'noise', source: 'roadsInAgglomeration', indicator: 'Lden', db_min: 60, db_max: 64 },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { layer: 'building', id: 'b1', height: 12 },
      },
    ])
    expect(map.features).toEqual([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.37632, 39.46992],
              [-0.37, 39.47],
              [-0.371, 39.471],
            ],
          ],
        },
        properties: { source: 'roadsInAgglomeration', indicator: 'Lden', db_min: 60, db_max: 64 },
      },
    ])
  })
})

describe('placesOf', () => {
  const place = (category: string, osm_id: number, distance_m: number, name: string | null = null) => ({
    category,
    osm_type: 'node',
    osm_id,
    name,
    lat: 39.47,
    lon: -0.376,
    distance_m,
  })

  it('lists the loud places nearest first, each once', () => {
    expect(
      placesOf({
        covered: ['bar', 'restaurant', 'pharmacy'],
        places: [
          place('restaurant', 2, 120, 'Sereno'),
          place('bar', 1, 92, 'Homenaje'),
          place('bar', 2, 120, 'Sereno'),
        ],
      }),
    ).toEqual({
      places: [
        { category: 'bar', name: 'Homenaje', distanceM: 92, lat: 39.47, lon: -0.376 },
        { category: 'restaurant', name: 'Sereno', distanceM: 120, lat: 39.47, lon: -0.376 },
      ],
      placesCovered: ['bar', 'restaurant'],
    })
  })

  it('has nothing for an answer it cannot read', () => {
    expect(placesOf(null)).toEqual({ places: [], placesCovered: [] })
  })
})
