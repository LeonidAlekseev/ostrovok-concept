'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { cn } from 'cn'
import { distanceText, durationText, placeNumbers, type ChatMap, type MapRoute } from '@/lib/geo/chatMap'

// MapLibre is loaded only with a map in the feed, and only in the browser; without it the list stays.
const PlacesMap = dynamic(() => import('./PlacesMap').catch(() => ({ default: () => null })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const ROUTE_HOW: Record<MapRoute['mode'], string> = { foot: 'пешком', car: 'на машине', straight: 'по прямой' }

function routeText(route: MapRoute): string {
  if (route.mode === 'straight') return `по прямой ${distanceText(route.distanceM)}, маршрута нет`
  const traffic = route.mode === 'car' ? ' без пробок' : ''
  return `${ROUTE_HOW[route.mode]} ${distanceText(route.distanceM)}, ${durationText(route.durationS)}${traffic}`
}

/**
 * The map of Эвал's answer and the list of its places with the same numbers: the name, the kind, the distance and
 * the route to it. The list is the answer without the map too: when MapLibre cannot load, or for a screen reader.
 * `compact` is the hotel card's: a lower map in its short feed.
 */
export function MapMessage({ map, compact, className }: { map: ChatMap; compact?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false)
  const numbers = placeNumbers(map)
  return (
    <figure className={cn('flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-muted', className)}>
      {!failed && (
        <div className={compact ? 'h-40' : 'h-56 sm:h-64'}>
          <PlacesMap map={map} onFail={() => setFailed(true)} />
        </div>
      )}
      <figcaption className="flex flex-col gap-2 px-3.5 py-2.5 text-sm/[1.35]">
        <ol className="flex flex-col gap-1.5" aria-label="Места на карте">
          {map.points.map((point, i) => {
            if (point.kind !== 'place') return null
            const route = map.routes.find((r) => r.to === point.label)
            return (
              <li key={`${point.label}-${i}`} className="flex gap-2">
                <span
                  className="mt-px flex size-5 flex-none items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background"
                  aria-hidden
                >
                  {numbers[i]}
                </span>
                <span className="min-w-0">
                  <span className="font-semibold">{point.label}</span>
                  {point.category && point.category.toLocaleLowerCase('ru') !== point.label.toLocaleLowerCase('ru') && (
                    <span className="text-muted-foreground-strong"> · {point.category}</span>
                  )}
                  {point.distanceM !== undefined && (
                    <span className="text-muted-foreground-strong"> · {distanceText(point.distanceM)} от отеля</span>
                  )}
                  {route && <span className="block text-muted-foreground-strong">{routeText(route)}</span>}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="text-xs/[normal] text-muted-foreground-strong">
          {map.points.some((p) => p.source === 'ostrovok') ? 'Данные Островка и' : 'Данные'}{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2"
          >
            © OpenStreetMap
          </a>
        </p>
      </figcaption>
    </figure>
  )
}
