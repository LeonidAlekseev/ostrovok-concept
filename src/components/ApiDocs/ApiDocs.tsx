'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MapUnavailable } from '@/components/MapUnavailable/MapUnavailable'
import { geoExamples, geoOfResponse, hotelRoute, type GeoAnswer, type GeoExample, type GeoPoint } from './geo'
import { DOCUMENTS } from './documents'

// Scalar and MapLibre run only in the browser and only here: their chunks load with the page, not the site.
const Reference = dynamic(() => import('./Reference'), {
  ssr: false,
  loading: () => <p className="p-6 text-muted-foreground">Загружаю документацию…</p>,
})
const ResponseMap = dynamic(() => import('./ResponseMap'), { ssr: false })

/** What the map shows: the answer of «Try it» or an example of the document. */
interface Shown {
  answer: GeoAnswer
  /** «GET /api/hotels/ota-9096882/noise-map» or the example's title. */
  caption: string
}

/** The routes whose answers the map draws; a request elsewhere leaves it as it is. */
const isGeoPath = (path: string) => path === '/api/hotels' || path === '/api/assistant' || hotelRoute(path) !== null

/**
 * The docs of the site's API (`/api/docs`): Scalar's interactive reference of /api/openapi.json and of the Supabase
 * part, and the map of the answer of a geo route — the hotels, the view, the buildings, the noise, Эвал's places and
 * routes — over the reference, next to Scalar's answer. The examples of the document go to the map without a request.
 */
export function ApiDocs() {
  const [shown, setShown] = useState<Shown | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [examples, setExamples] = useState<GeoExample[]>([])
  const hotels = useRef(new Map<string, Promise<GeoPoint | null>>())

  /** The point of a hotel for its marker, once a hotel. */
  const hotelPoint = useCallback((hotelId: string) => {
    let point = hotels.current.get(hotelId)
    if (!point) {
      point = fetch(`/api/hotels?ids=${encodeURIComponent(hotelId)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { hotels?: GeoPoint[] } | null) => {
          const hotel = body?.hotels?.[0]
          return hotel ? { lat: hotel.lat, lon: hotel.lon } : null
        })
        .catch(() => null)
      hotels.current.set(hotelId, point)
    }
    return point
  }, [])

  const show = useCallback(
    async (path: string, body: unknown, caption: string) => {
      const route = hotelRoute(path)
      const answer = geoOfResponse(path, body, route ? await hotelPoint(route.hotelId) : null)
      setShown(answer ? { answer, caption } : null)
    },
    [hotelPoint],
  )

  const onResponse = useCallback(
    (url: string, response: Response) => {
      const { origin, pathname } = new URL(url, window.location.href)
      if (origin !== window.location.origin || !isGeoPath(pathname)) return
      void response
        .json()
        .catch(() => null)
        .then((body) => show(pathname, body, `${response.status} · ${pathname}`))
    },
    [show],
  )

  useEffect(() => {
    let live = true
    fetch(DOCUMENTS[0].url)
      .then((response) => response.json())
      .then((document) => live && setExamples(geoExamples(document)))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <main className="flex w-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-(--page-max) flex-col gap-3 px-(--page-x) pt-[clamp(16px,4vw,32px)] pb-4">
        <h1 className="text-title leading-tight font-bold tracking-[-0.02em]">API</h1>
        <p className="max-w-3xl text-muted-foreground">
          Маршруты сайта и раздел Supabase в OpenAPI 3.1. «Try it» отправляет запрос в это окружение; ответ гео-маршрута
          — отели, вид, здания, шум, места и маршруты Эвала — показывается на карте.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {DOCUMENTS.map((document) => (
            <a key={document.url} className="font-medium text-primary underline" href={document.url}>
              {document.url}
            </a>
          ))}
        </p>
        {examples.length > 0 && (
          <section aria-labelledby="api-examples" className="flex flex-col gap-2">
            <h2 id="api-examples" className="text-sm font-semibold">
              Пример на карте
            </h2>
            {/* One row that scrolls on a phone, rows on a wider screen. */}
            <ul className="-mx-(--page-x) flex gap-2 overflow-x-auto px-(--page-x) pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {examples.map((example) => (
                <li key={example.id} className="shrink-0 sm:max-w-full sm:shrink">
                  <Button
                    variant="outline"
                    size="sm"
                    shape="pill"
                    className="max-w-full"
                    onClick={() => void show(example.path, example.body, `Пример · ${example.summary}`)}
                  >
                    <MapPin aria-hidden />
                    <span className="truncate">{example.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </header>

      <div className="min-w-0 flex-1 border-t">
        <Reference onResponse={onResponse} />
      </div>

      {shown && (
        <section
          aria-label="Карта ответа"
          className="fixed inset-x-2 bottom-2 z-[10000] flex h-[45dvh] flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-popover) sm:right-auto sm:bottom-4 sm:left-4 sm:h-[400px] sm:w-[440px]"
        >
          <div className="flex items-center gap-2 border-b py-1 pr-1 pl-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{shown.answer.title}</p>
              <p className="truncate text-xs text-muted-foreground">{shown.caption}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Закрыть карту" onClick={() => setShown(null)}>
              <X aria-hidden />
            </Button>
          </div>
          <div className="relative min-h-0 flex-1">
            {mapFailed ? <MapUnavailable /> : <ResponseMap answer={shown.answer} onFail={() => setMapFailed(true)} />}
          </div>
        </section>
      )}
    </main>
  )
}
