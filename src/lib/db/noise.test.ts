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
  const geometry = { type: 'Polygon', coordinates: [] }
  const band = (source: string, indicator: string, db_min: number | null, db_max: number | null) => ({
    type: 'Feature',
    geometry,
    properties: { layer: 'noise', source, indicator, db_min, db_max },
  })
  const piece = (lden: [number, number | null], lnight: [number | null, number | null]) => ({
    type: 'Feature',
    geometry,
    properties: {
      layer: 'noise',
      source: 'roadsInAgglomeration',
      lden_min: lden[0],
      lden_max: lden[1],
      lnight_min: lnight[0],
      lnight_max: lnight[1],
    },
  })

  it('keeps the Lnight contours with rounded coordinates and drops Lden and the buildings', () => {
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
        properties: { layer: 'noise', source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 55, db_max: 59 },
      },
      band('roadsInAgglomeration', 'Lden', 60, 64),
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
        properties: { source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 55, db_max: 59, level: 55 },
      },
    ])
  })

  it('drops the bands below 40 dB of the layers and adds the quiet, Lden’s as the day’s', () => {
    const map = noiseMapOf(
      [band('industryInAgglomeration', 'Lnight', null, 39), band('roadsInAgglomeration', 'Lnight', 55, 59)],
      [
        band('quiet', 'Lden', null, 39),
        band('quiet', 'Lnight', null, 39),
        band('roadsInAgglomeration', 'Lnight', null, 39),
      ],
    )
    expect(map.features.map((f) => [f.properties.source, f.properties.indicator, f.properties.level])).toEqual([
      ['roadsInAgglomeration', 'Lnight', 55],
      ['quiet', 'Lday', null],
      ['quiet', 'Lnight', null],
    ])
  })

  it('gives each piece of hotel_noise_day the day estimate of its two bands', () => {
    const map = noiseMapOf(
      [],
      [],
      [piece([65, 69], [55, 59]), piece([40, 44], [null, 39]), piece([75, null], [65, 69]), piece([55, 59], [55, 59])],
    )
    expect(map.features.map((f) => f.properties)).toEqual([
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 59, db_max: 69, level: 64 },
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 34, db_max: 45, level: 39.2 },
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 69, db_max: null, level: 68.6 },
      // A night of 55 dB alone is louder than an Lden below 60: no day fits.
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: null, db_max: null, level: null },
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
