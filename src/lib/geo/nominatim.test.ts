import { describe, expect, it, vi } from 'vitest'
import reverse from './fixtures/nominatim-reverse.json'
import search from './fixtures/nominatim-search.json'
import { RateGate } from './limits'
import { geocodeUrl, nominatimReverse, nominatimSearch, parseReverse, parseSearch, reverseUrl } from './nominatim'

const deps = (fetch: typeof globalThis.fetch) => ({
  budget: { deadline: Date.now() + 9000 },
  gate: new RateGate(),
  fetch,
})

// assistant-geo, Requirement: Гео-инструменты Эвала
describe('Nominatim', () => {
  it('searches within Valencia only, in Russian', () => {
    const url = new URL(geocodeUrl('Mercado Central'))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Mercado Central',
      format: 'jsonv2',
      limit: '5',
      viewbox: '-0.53,39.58,-0.27,39.27',
      bounded: '1',
      'accept-language': 'ru',
    })
    expect(reverseUrl({ lat: 39.4699, lon: -0.3763 })).toContain('/reverse?lat=39.4699&lon=-0.3763&format=jsonv2')
  })

  it('reads the places of a search', () => {
    expect(parseSearch(search)).toEqual([
      {
        osmType: 'way',
        osmId: 5007139,
        name: 'Центральный рынок Валенсии',
        displayName: expect.stringContaining('Plaça de la Ciutat de Bruges'),
        lat: 39.4734917,
        lon: -0.3789053,
        categories: ['other'],
        tags: { amenity: 'marketplace' },
      },
    ])
    expect(
      parseSearch([
        { osm_type: 'node', osm_id: 1, lat: '39.4', lon: '-0.3', category: 'amenity', type: 'pharmacy' },
      ])[0],
    ).toMatchObject({ categories: ['pharmacy'], name: null })
    expect(parseSearch({ error: 'x' })).toEqual([])
    expect(parseSearch([{ lat: '1', lon: '2' }])).toEqual([])
  })

  it('reads the address of a point', () => {
    expect(parseReverse(reverse)).toMatchObject({
      lat: 39.4701926,
      lon: -0.3757294,
      address: { road: "Plaça de l'Ajuntament", house_number: '21', city: 'Валенсия', postcode: '46002' },
    })
    expect(parseReverse({ error: 'Unable to geocode' })).toBeUndefined()
  })

  it('says it found nothing in Valencia', async () => {
    const result = await nominatimSearch('Эйфелева башня', deps(vi.fn(async () => Response.json([]))))
    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
      message: 'В Валенсии не нашёл «Эйфелева башня» в OpenStreetMap.',
    })
    const sea = await nominatimReverse(
      { lat: 39.4, lon: -0.2 },
      deps(vi.fn(async () => Response.json({ error: 'Unable to geocode' }))),
    )
    expect(sea).toMatchObject({ reason: 'not-found' })
  })

  it('finds a place', async () => {
    const result = await nominatimSearch('Mercado Central', deps(vi.fn(async () => Response.json(search))))
    expect(result.ok && result.value[0].osmId).toBe(5007139)
  })
})
