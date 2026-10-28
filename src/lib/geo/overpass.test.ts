import { describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/overpass-valencia.json'
import { RateGate } from './limits'
import { elementRow, overpassPlaces, overpassQuery, parseOverpass } from './overpass'

const rows = () => {
  const result = parseOverpass(fixture)
  if (!result.ok) throw new Error(result.message)
  return new Map(result.value.map((row) => [`${row.osm_type}/${row.osm_id}`, row]))
}

// assistant-geo, Requirement: Дозапись мест из OSM
describe('the Overpass query', () => {
  it('asks around a point with points and centres only, within its timeout', () => {
    const query = overpassQuery(['pharmacy', 'bar'], { around: { lat: 39.47, lon: -0.376, radiusM: 800.4 } }, 4)
    expect(query).toBe(
      [
        '[out:json][timeout:4];',
        '(nwr["amenity"="pharmacy"](around:800,39.47,-0.376);nwr["healthcare"="pharmacy"](around:800,39.47,-0.376);' +
          'nwr["amenity"~"^(bar|pub)$"](around:800,39.47,-0.376);)->.all;',
        '.all out tags center qt;',
      ].join('\n'),
    )
  })

  it('asks a rectangle and keeps the geometry of the shapes', () => {
    const query = overpassQuery(
      ['beach', 'cafe'],
      { bbox: { south: 39.27, west: -0.53, north: 39.58, east: -0.27 } },
      180,
    )
    expect(query).toContain('[out:json][timeout:180][bbox:39.27,-0.53,39.58,-0.27];')
    expect(query).toContain('(way.all["natural"="beach"];)->.shapes;')
    expect(query).toContain('(.all; - .shapes;)->.points;')
    expect(query).toContain('.shapes out tags geom qt;')
  })
})

describe('the Overpass answer', () => {
  it('reads a node as a point with its name and categories', () => {
    expect(rows().get('node/105865399')).toEqual({
      osm_type: 'node',
      osm_id: 105865399,
      name: 'Farmacia del Treda',
      categories: ['pharmacy'],
      tags: { amenity: 'pharmacy', healthcare: 'pharmacy', name: 'Farmacia del Treda' },
      lat: 39.4951529,
      lon: -0.3964149,
      geom: 'SRID=4326;POINT(-0.3964149 39.4951529)',
    })
  })

  it('keeps a beach as a polygon and the coast as a line, the marker on the line', () => {
    const beach = rows().get('way/156305130')!
    expect(beach.categories).toEqual(['beach'])
    expect(beach.geom).toMatch(/^SRID=4326;POLYGON\(\(-0\.2852396 39\.5607328,.*-0\.2852396 39\.5607328\)\)$/)
    const coast = rows().get('way/4787521')!
    expect(coast.categories).toEqual(['sea'])
    expect(coast.geom).toMatch(/^SRID=4326;LINESTRING\(-0\.2897897 39\.5549594,/)
    expect({ lat: coast.lat, lon: coast.lon }).toEqual({ lat: 39.5561012, lon: -0.289108 })
  })

  it('takes the centre of other ways and of relations', () => {
    const hospital = rows().get('way/105443286')!
    expect(hospital.categories).toEqual(['hospital'])
    expect(hospital.geom).toBe('SRID=4326;POINT(-0.3641796 39.4780196)')
    expect(rows().get('relation/20242344')).toMatchObject({
      name: 'Aeropuerto Internacional de Valencia',
      categories: ['airport'],
    })
    expect(rows().get('node/34105607')!.categories).toEqual(['centre'])
  })

  it('keeps a park mapped as a relation as its border, the centre as the marker, and the others as a centre', () => {
    const square = (x: number, y: number, size: number) => [
      { lat: y, lon: x },
      { lat: y, lon: x + size },
      { lat: y + size, lon: x + size },
      { lat: y + size, lon: x },
      { lat: y, lon: x },
    ]
    const park = elementRow({
      type: 'relation',
      id: 5,
      tags: { leisure: 'park', name: 'Parque' },
      center: { lat: 39.5, lon: -0.5 },
      polygons: [[square(-0.51, 39.49, 0.02), square(-0.505, 39.495, 0.01)], [square(-0.4, 39.4, 0.01)]],
    })!
    expect(park).toMatchObject({ osm_type: 'relation', categories: ['park'], lat: 39.5, lon: -0.5 })
    expect(park.geom).toBe(
      'SRID=4326;MULTIPOLYGON(((-0.51 39.49,-0.49 39.49,-0.49 39.51,-0.51 39.51,-0.51 39.49),' +
        '(-0.505 39.495,-0.495 39.495,-0.495 39.505,-0.505 39.505,-0.505 39.495)),' +
        '((-0.4 39.4,-0.39 39.4,-0.39 39.41,-0.4 39.41,-0.4 39.4)))',
    )
    // Without usable polygons (an online answer has none) or for a relation that is no shape, the centre stays.
    const centre = { type: 'relation', id: 5, tags: { leisure: 'park' }, center: { lat: 39.5, lon: -0.5 } }
    expect(elementRow(centre)!.geom).toBe('SRID=4326;POINT(-0.5 39.5)')
    expect(elementRow({ ...centre, polygons: [[[{ lat: 1, lon: 1 }]]] })!.geom).toBe('SRID=4326;POINT(-0.5 39.5)')
    expect(elementRow({ ...centre, tags: { amenity: 'hospital' }, polygons: [[square(0, 0, 1)]] })!.geom).toBe(
      'SRID=4326;POINT(-0.5 39.5)',
    )
  })

  it('tells the metro from the tram', () => {
    expect(rows().get('node/100986804')!.categories).toEqual(['metro'])
    expect(rows().get('node/107171636')!.categories).toEqual(['tram'])
  })

  it('leaves out the elements of no category or without coordinates', () => {
    expect(rows().has('node/1')).toBe(false)
    expect(rows().has('node/2')).toBe(false)
    expect(elementRow({ type: 'node', id: 3, tags: { amenity: 'bar' } })).toBeUndefined()
    expect(elementRow({ type: 'area', id: 4, lat: 1, lon: 1, tags: { amenity: 'bar' } })).toBeUndefined()
  })

  it('takes an element given twice once', () => {
    const node = fixture.elements[0]
    const result = parseOverpass({ elements: [node, node] })
    expect(result.ok && result.value).toHaveLength(1)
  })

  it('fails an answer cut by a runtime error', () => {
    const cut = { elements: [fixture.elements[0]], remark: 'runtime error: Query timed out in "query" at line 2' }
    expect(parseOverpass(cut)).toMatchObject({ ok: false, reason: 'timeout', service: 'overpass' })
    expect(parseOverpass({ elements: [], remark: 'runtime error: out of memory' })).toMatchObject({
      reason: 'unavailable',
    })
    expect(parseOverpass('<html>')).toMatchObject({ ok: false, reason: 'unavailable' })
  })
})

// assistant-geo, Requirement: Запасной адрес Overpass
describe('the reserve Overpass server', () => {
  const area = { around: { lat: 39.47, lon: -0.376, radiusM: 500 } }
  const ask = (fetch: typeof globalThis.fetch, urls = ['https://main.example/api', 'https://reserve.example/api']) =>
    overpassPlaces(['bar'], area, { budget: { deadline: Date.now() + 9000 }, gate: new RateGate(), fetch, urls })

  it('is asked when the main one answers 502, and its answer is taken', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).startsWith('https://main')
        ? new Response('Bad Gateway', { status: 502 })
        : Response.json({ elements: [] }),
    )
    expect(await ask(fetch)).toEqual({ ok: true, value: [] })
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://main.example/api',
      'https://reserve.example/api',
    ])
  })

  it('is not asked when the main one answered', async () => {
    const fetch = vi.fn(async () => Response.json({ elements: [] }))
    await ask(fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('is not asked after a 429, which closes the service', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '30' } }))
    const result = await ask(fetch)
    expect(result).toMatchObject({ ok: false, reason: 'limited' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails honestly when both fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = vi.fn(async () => new Response('', { status: 502 }))
    expect(await ask(fetch)).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
