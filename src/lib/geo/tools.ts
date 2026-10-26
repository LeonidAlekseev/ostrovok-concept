import 'server-only'
import { tool } from 'ai'
import { z } from 'zod'
import { CATEGORY, PLACE_CATEGORIES } from './categories'
import type { CallBudget } from './http'
import { RATE_RULES, RateGate } from './limits'
import { nominatimReverse, nominatimSearch } from './nominatim'
import { walkingRoute } from './osrm'
import { overpassPlaces } from './overpass'
import { geocode, nearbyPlaces, type PlaceStore } from './places'
import { sharedOsmCounter, supabasePlaceStore } from './store'

/**
 * Эвал's geo tools as AI SDK `tool()`s: a place by its name, the address of a point, the places near a point by
 * category, the walk between two points. The results are typed for the map of the chat (points `lat/lon`, metres,
 * GeoJSON `[lon, lat]`); a failed service is a `GeoFailure` with the words for the traveller, never a guess. The turn
 * calling them is the next change (`assistant-map-message`).
 */

export interface GeoDeps {
  store: PlaceStore
  gate: RateGate
  fetch?: typeof fetch
}

/** One gate a process: the limits of the services hold across the turns; the shared counter across the instances. */
let serverGate: RateGate | undefined
const serverDeps = (): GeoDeps => ({
  store: supabasePlaceStore,
  gate: (serverGate ??= new RateGate(RATE_RULES, { shared: sharedOsmCounter })),
})

const point = z.object({
  lat: z.number().min(-90).max(90).describe('широта, градусы'),
  lon: z.number().min(-180).max(180).describe('долгота, градусы'),
})

const categoryList = PLACE_CATEGORIES.map((c) => `${c} — ${CATEGORY[c].label}`).join('; ')

/**
 * The tools for a turn due at `deadline` (ms since the epoch); `signal` aborts them with the turn. Each call also
 * keeps to its own service's time (src/lib/geo/http.ts).
 */
export function geoTools({ deadline, signal }: { deadline: number; signal?: AbortSignal }, deps = serverDeps()) {
  const budget = (abortSignal?: AbortSignal): CallBudget => ({
    deadline,
    signal: signal && abortSignal ? AbortSignal.any([signal, abortSignal]) : (signal ?? abortSignal),
  })
  const services = (b: CallBudget) => ({ budget: b, gate: deps.gate, fetch: deps.fetch })

  return {
    geocode: tool({
      description:
        'Найти место в Валенсии по названию или адресу (OpenStreetMap). Возвращает точки lat/lon с названием и адресом.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(200).describe('название места или адрес') }),
      execute: ({ query }, { abortSignal }) => {
        const b = budget(abortSignal)
        return geocode(query, { store: deps.store, budget: b, search: (q) => nominatimSearch(q, services(b)) })
      },
    }),

    reverseGeocode: tool({
      description: 'Адрес точки по координатам (OpenStreetMap): улица, дом, район, город.',
      inputSchema: point,
      execute: (p, { abortSignal }) => nominatimReverse(p, services(budget(abortSignal))),
    }),

    nearbyPlaces: tool({
      description:
        'Ближайшие места нужных категорий вокруг точки (обычно отеля) с расстоянием в метрах по прямой до места. ' +
        `Категории: ${categoryList}. До моря — sea, до центра — centre, до аэропорта — airport (радиус 20000). ` +
        'status none — проверено, в радиусе нет; unchecked — проверить не удалось, так и скажи.',
      inputSchema: point.extend({
        categories: z.array(z.enum(PLACE_CATEGORIES)).min(1).max(6),
        radiusM: z.number().int().min(50).max(50_000).default(1000).describe('радиус поиска, метры'),
        perCategory: z.number().int().min(1).max(10).default(3).describe('сколько мест каждой категории'),
      }),
      execute: ({ lat, lon, categories, radiusM, perCategory }, { abortSignal }) => {
        const b = budget(abortSignal)
        return nearbyPlaces(
          { lat, lon },
          [...new Set(categories)],
          { radiusM, perCategory },
          {
            store: deps.store,
            budget: b,
            overpass: (cats, area, callBudget) => overpassPlaces(cats, area, services(callBudget)),
          },
        )
      },
    }),

    walkingRoute: tool({
      description:
        'Пешеходный маршрут между двумя точками: расстояние, время и линия маршрута. kind straight — маршрут ' +
        'не получен, это расстояние по прямой: так и скажи «по прямой».',
      inputSchema: z.object({ from: point, to: point }),
      execute: ({ from, to }, { abortSignal }) => walkingRoute(from, to, services(budget(abortSignal))),
    }),
  }
}

export type GeoTools = ReturnType<typeof geoTools>
