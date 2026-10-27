// The examples of the OpenAPI document (/api/openapi.json): the real answers of a running site about the hotel
// ota-9096882 of Valencia, with long arrays cut to a few items. Nothing is made up: rerun after the catalogue changes.
//   npm run dev, then: npm run docs:examples [-- http://localhost:3000]
import { mkdirSync, writeFileSync } from 'node:fs'

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const out = new URL('../src/lib/openapi/examples/', import.meta.url)
const HOTEL = 'ota-9096882'
/** The box of the map around the hotel, as the hotel page asks for it. */
const BBOX = '-0.345,39.375,-0.32,39.39'

type Json = Record<string, unknown>

async function call(path: string, body?: unknown): Promise<Json> {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as Json
}

const first = <T>(items: T[] | undefined, count: number) => (items ?? []).slice(0, count)

/** A hotel with a room, two photos, a review: the shape is whole, the arrays are short. */
const shortHotel = (hotel: Json): Json => ({
  ...hotel,
  photos: first(hotel.photos as Json[], 2),
  guestPhotos: first(hotel.guestPhotos as Json[], 1),
  rooms: first(hotel.rooms as Json[], 1),
  reviews: first(hotel.reviews as Json[], 1),
})

/** A line of sight with at most two buildings in the way of each eye. */
const shortLine = (line: Json | null): Json | null =>
  line && {
    ...line,
    eyes: (line.eyes as Json[]).map((eye) => ({ ...eye, blockers: first(eye.blockers as Json[], 2) })),
  }

/** The features of a map that fit into about `bytes` of JSON together, in their order: small shapes rather than one. */
function shortMap(map: Json | null, bytes: number): Json | null {
  if (!map) return map
  const kept: unknown[] = []
  let size = 0
  for (const feature of map.features as unknown[]) {
    const length = JSON.stringify(feature).length
    if (size + length > bytes) continue
    size += length
    kept.push(feature)
  }
  return { ...map, features: kept }
}

function write(name: string, value: unknown) {
  const text = `${JSON.stringify(value, null, 2)}\n`
  writeFileSync(new URL(`${name}.json`, out), text)
  console.log(`${name}.json: ${(text.length / 1024).toFixed(1)} KB`)
}

mkdirSync(out, { recursive: true })

const { hotels } = (await call(`/api/hotels?ids=${HOTEL}`)) as { hotels: Json[] }
write('hotels-ids', { query: { ids: HOTEL }, response: { hotels } })

const box = (await call(`/api/hotels?bbox=${BBOX}`)) as { hotels: Json[] }
write('hotels-bbox', { query: { bbox: BBOX }, response: { hotels: first(box.hotels, 3).map(shortHotel) } })

const city = (await call('/api/hotels?destinations=valencia')) as { hotels: Json[] }
write('hotels-destinations', {
  query: { destinations: 'valencia' },
  response: { hotels: first(city.hotels, 2).map(shortHotel) },
})

const { view } = (await call(`/api/hotels/${HOTEL}/view`)) as { view: Json }
const targets = (items: Json[]) => items.map((target) => ({ ...target, line: shortLine(target.line as Json | null) }))
write('view', {
  view: {
    ...view,
    // Every 10th ray of 120: one in 30°.
    rays: (view.rays as Json[])
      .filter((_, i) => i % 10 === 0)
      .map((ray) => ({ ...ray, line: shortLine(ray.line as Json) })),
    sea: targets(view.sea as Json[]),
    landmarks: targets(view.landmarks as Json[]),
  },
})

const viewMap = await call(`/api/hotels/${HOTEL}/view-map`)
write('view-map', { map: shortMap(viewMap.map as Json | null, 6000) })

const noiseMap = await call(`/api/hotels/${HOTEL}/noise-map`)
write('noise-map', { map: shortMap(noiseMap.map as Json | null, 8000) })

const geoRequest = {
  messages: [{ role: 'user', text: 'Где рядом аптека и как до неё дойти?' }],
  brief: { hotelId: HOTEL },
}
write('assistant-geo', { request: geoRequest, response: await call('/api/assistant', geoRequest) })

const noiseRequest = { messages: [{ role: 'user', text: 'Тут шумно ночью?' }], brief: { hotelId: HOTEL } }
write('assistant-noise', { request: noiseRequest, response: await call('/api/assistant', noiseRequest) })

const wishRequest = {
  messages: [
    { role: 'user', text: 'Тихий отель у моря в Валенсии с 10 по 14 ноября' },
    { role: 'assistant', text: 'С кем едете?' },
    { role: 'user', text: 'Вдвоём' },
  ],
  brief: {
    vibe: 'sea',
    destinationId: 'valencia',
    quiet: true,
    seaMaxM: 1000,
    dates: { checkIn: '2026-11-10', checkOut: '2026-11-14' },
    when: 10,
    nights: 4,
  },
}
const wish = await call('/api/assistant', wishRequest)
const matches = first(wish.matches as Json[] | undefined, 3)
const features = wish.features as Record<string, unknown> | undefined
write('assistant-wish', {
  request: wishRequest,
  response: {
    ...wish,
    ...(matches.length > 0 && { matches }),
    ...(features && {
      features: Object.fromEntries(
        matches.flatMap((m) => (features[m.id as string] ? [[m.id, features[m.id as string]]] : [])),
      ),
    }),
  },
})

// The choice by the store's tools: the runs' characteristics by hotel, the first three hotels of the plan.
const knowledgeRequest = {
  messages: [
    { role: 'user', text: 'Найди отель в Валенсии, чтобы рядом была аптека и было тихо ночью' },
    { role: 'assistant', text: 'Когда планируете поехать?' },
    { role: 'user', text: 'Не важно' },
    { role: 'assistant', text: 'С кем едете?' },
    { role: 'user', text: 'Вдвоём' },
  ],
  brief: { destinationId: 'valencia', quiet: true, when: 'any', party: 'couple' },
}
const knowledge = await call('/api/assistant', knowledgeRequest)
const chosen = first(knowledge.matches as Json[] | undefined, 3)
const chosenFeatures = knowledge.features as Record<string, unknown> | undefined
write('assistant-knowledge', {
  request: knowledgeRequest,
  response: {
    ...knowledge,
    ...(chosen.length > 0 && { matches: chosen }),
    ...(chosenFeatures && {
      features: Object.fromEntries(
        chosen.flatMap((m) => (chosenFeatures[m.id as string] ? [[m.id, chosenFeatures[m.id as string]]] : [])),
      ),
    }),
  },
})
