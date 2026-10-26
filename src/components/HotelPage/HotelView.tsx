'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { Building2, Landmark, Sunset, Waves } from 'lucide-react'
import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import { todayIso } from '@/lib/dates'
import { distanceLabel, type HotelBuilding } from '@/lib/hotelDetails'
import {
  bearingLabel,
  buildingLabel,
  inSide,
  localTime,
  nearestRay,
  observerLabel,
  observerOf,
  openestSide,
  RAY_LENGTH_M,
  rayVerdict,
  seaVerdict,
  sideOf,
  sideSummary,
  SIDES,
  SUN_CHECK_ALTITUDE_DEG,
  sunsetOf,
  sunsetRange,
  targetVerdict,
  VERDICT_LABEL,
  verdictReason,
  VIEW_ASSUMPTIONS,
  type HotelView as HotelViewData,
  type SideId,
  type Verdict,
  type ViewTarget,
} from '@/lib/view'
import { HotelMapUnavailable } from './HotelMapUnavailable'

// MapLibre is loaded only in the browser.
const ViewMap = dynamic(() => import('./ViewMap').catch(() => ({ default: () => <HotelMapUnavailable /> })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const card = 'flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)'

const VERDICT_CLASS: Record<Verdict, string> = {
  visible: 'bg-success-soft text-success-foreground',
  obstructed: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  unknown: 'bg-muted text-muted-foreground',
}

/** Today never changes while the page is open: nothing to subscribe to. */
const noChanges = () => () => {}

/** The compass as a 3×3 grid: the sides around the building. */
const COMPASS: (SideId | null)[] = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se']

/** The view from the floor (`GET /api/hotels/<id>/view?floor=`): `null` while it comes and when there is none. */
function useView(hotelId: string, floor: number | null, enabled: boolean) {
  const [state, setState] = useState<{ key: string; view: HotelViewData | null } | null>(null)
  const key = `${hotelId}:${floor ?? ''}`
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/view${floor ? `?floor=${floor}` : ''}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<{ view: HotelViewData | null }>) : null))
      .then((body) => setState({ key, view: body?.view ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, view: null })
      })
    return () => controller.abort()
  }, [hotelId, floor, key, enabled])
  return { view: state?.view ?? null, loading: enabled && state?.key !== key }
}

/** The buildings around the hotel (`GET /api/hotels/<id>/view-map`): `null` until they come and on a failure. */
function useViewMap(hotelId: string) {
  const [map, setMap] = useState<ViewMapData | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/view-map`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ map: ViewMapData | null }>) : null))
      .then((body) => setMap(body?.map ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [hotelId])
  return map
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', VERDICT_CLASS[verdict])}>
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

/** A line of a list: the icon, what is checked and how far, the verdict and why. */
function Row({
  icon: Icon,
  title,
  lines,
  verdict,
}: {
  icon: typeof Waves
  title: string
  lines: (string | null | false | undefined)[]
  verdict: Verdict
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{title}</span>
          <VerdictBadge verdict={verdict} />
        </span>
        {lines.filter(Boolean).map((line) => (
          <span key={line as string} className="text-sm text-muted-foreground">
            {line}
          </span>
        ))}
      </span>
    </li>
  )
}

const targetLines = (target: ViewTarget, verdict: Verdict) => [
  `${target.category} · ${distanceLabel(target.distanceM)} · азимут ${bearingLabel(target.bearing)}`,
  verdictReason(target.line, verdict),
]

/**
 * «Вид из отеля» of a real hotel: from a floor of its building (EUBUCCO) — the sea, the sunset of a date and the
 * attractions of OSM and the places of Ostrovok, each «вероятно видно», «возможны препятствия» or «недостаточно
 * данных» by the lines of sight over the buildings; the compass picks the side of the windows, which no data gives yet.
 * The map stands EUBUCCO's buildings around the hotel, turned to the side. Without a reliable height of the hotel's
 * building nothing is checked: «недостаточно данных».
 */
export function HotelView({ hotel, building }: { hotel: Hotel; building: HotelBuilding | null | undefined }) {
  const top = observerOf(building)
  const [floor, setFloor] = useState<number | null>(top?.floor ?? null)
  const { view, loading } = useView(hotel.id, floor, Boolean(top))
  const buildings = useViewMap(hotel.id)
  const [failed, setFailed] = useState(false)
  // The date is the visitor's today in the browser (the prerendered page has none) until one is picked.
  const today = useSyncExternalStore(noChanges, todayIso, () => '')
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? today
  const [side, setSide] = useState<SideId | null>(null)

  const shownSide = side ?? (view ? openestSide(view.rays) : 'w')
  const sunset = date ? sunsetOf(date, hotel.lat, hotel.lon) : null
  const range = date ? sunsetRange(Number(date.slice(0, 4)), hotel.lat, hotel.lon) : null
  const sunRay = view && sunset ? nearestRay(view.rays, sunset.checkAzimuth) : undefined
  const sunVerdict: Verdict = sunRay ? rayVerdict(sunRay, SUN_CHECK_ALTITUDE_DEG) : 'unknown'
  const sea = view ? seaVerdict(view) : null
  const sideSea = view ? seaVerdict(view, shownSide) : null
  const eyeM = view?.observer.eyeM ?? 0
  const landmarks = useMemo(
    () => (view?.landmarks ?? []).map((target) => ({ target, verdict: targetVerdict(target, eyeM) })),
    [view, eyeM],
  )
  const inView = landmarks.filter(({ target }) => inSide(target.bearing, shownSide))
  const summary = view ? sideSummary(view.rays, shownSide) : null
  const mapTargets = [
    ...(sideSea?.point ? [{ ...sideSea.point, verdict: sideSea.verdict }] : []),
    ...inView.map(({ target, verdict }) => ({ lat: target.lat, lon: target.lon, verdict })),
  ]
  const blockers = [
    ...(sunVerdict === 'obstructed' && sunRay?.line.blocker ? [sunRay.line.blocker.id] : []),
    ...(sideSea?.verdict === 'obstructed' && sideSea.point?.line?.blocker ? [sideSea.point.line.blocker.id] : []),
    ...inView.flatMap(({ target, verdict }) =>
      verdict === 'obstructed' && target.line?.blocker ? [target.line.blocker.id] : [],
    ),
  ]
  const sunInSide = sunset && inSide(sunset.azimuth, shownSide)

  return (
    <section id="view" tabIndex={-1} aria-labelledby="view-title" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-col gap-1">
        <h2 id="view-title" className="text-heading font-bold">
          Вид из отеля
        </h2>
        <p className="text-muted-foreground">
          Видно ли море, закат и места рядом из окна — по высотам зданий EUBUCCO и линии взгляда над крышами.
        </p>
      </div>

      <div className="relative h-[clamp(18rem,55vw,28rem)] overflow-hidden rounded-2xl bg-muted">
        {failed ? (
          <HotelMapUnavailable />
        ) : (
          <ViewMap
            center={{ lat: hotel.lat, lon: hotel.lon }}
            buildings={buildings}
            bearing={sideOf(shownSide).bearing}
            sunAzimuth={sunset?.azimuth ?? null}
            targets={mapTargets}
            blockers={blockers}
            onFail={() => setFailed(true)}
          />
        )}
        {!failed && (
          <p className="pointer-events-none absolute top-2 left-2 rounded-xl bg-white/90 px-2.5 py-1.5 text-xs text-foreground shadow-sm dark:bg-card/90">
            Вверху — {sideOf(shownSide).label.toLocaleLowerCase('ru')}; оранжевая линия — закат, оранжевые здания мешают
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="view-window-title" className={card}>
          <h3 id="view-window-title" className="text-lg font-bold">
            Окно
          </h3>
          {top ? (
            <>
              <p className="flex gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-col">
                  <b>{buildingLabel(top)}</b>
                  <span className="text-sm text-muted-foreground">
                    {observerLabel(view?.observer ?? observerOf(building, floor)!)}
                  </span>
                </span>
              </p>
              {top.floors && top.floors > 1 && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  Этаж
                  <select
                    value={floor ?? top.floors}
                    onChange={(event) => setFloor(Number(event.target.value))}
                    className="rounded-lg border border-input bg-background px-2 py-1"
                  >
                    {Array.from({ length: top.floors }, (_, i) => top.floors! - i).map((n) => (
                      <option key={n} value={n}>
                        {n === top.floors ? `${n} (верхний)` : n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Высоты здания отеля нет в EUBUCCO или она сомнительна (номера занимают больше этажей, чем у найденного
              здания), поэтому видимость не проверяем — недостаточно данных.
            </p>
          )}
        </section>

        <section aria-labelledby="view-sun-title" className={card}>
          <h3 id="view-sun-title" className="text-lg font-bold">
            Закат
          </h3>
          <label className="flex items-center justify-between gap-3 text-sm">
            Дата
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && setPicked(event.target.value)}
              className="rounded-lg border border-input bg-background px-2 py-1"
            />
          </label>
          {sunset ? (
            <ul className="flex flex-col gap-3">
              <Row
                icon={Sunset}
                title={`Закат в ${localTime(sunset.at)}`}
                verdict={top ? (loading ? 'unknown' : sunVerdict) : 'unknown'}
                lines={[
                  `Азимут ${bearingLabel(sunset.azimuth)}; на высоте ${SUN_CHECK_ALTITUDE_DEG}° — в ${localTime(sunset.checkAt)}, азимут ${Math.round(sunset.checkAzimuth)}°`,
                  range &&
                    `За год закат смещается от ${Math.round(range.winter)}° зимой до ${Math.round(range.summer)}° летом`,
                  top && !loading && sunRay && verdictReason(sunRay.line, sunVerdict),
                ]}
              />
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Выберите дату.</p>
          )}
        </section>

        <section aria-labelledby="view-sea-title" className={card}>
          <h3 id="view-sea-title" className="text-lg font-bold">
            Море
          </h3>
          {!top ? (
            <p className="text-sm text-muted-foreground">Недостаточно данных: нет надёжной высоты здания отеля.</p>
          ) : loading ? (
            <p className="h-12 animate-pulse rounded-xl bg-muted" aria-label="Проверяем" />
          ) : !view ? (
            <p className="text-sm text-muted-foreground">Не удалось проверить — недостаточно данных.</p>
          ) : !view.seaChecked ? (
            <p className="text-sm text-muted-foreground">
              Берег моря OpenStreetMap у отеля не загружен — недостаточно данных.
            </p>
          ) : sea?.point ? (
            <ul className="flex flex-col gap-3">
              <Row
                icon={Waves}
                title={`Берег в ${distanceLabel(sea.point.distanceM)}`}
                verdict={sea.verdict}
                lines={[
                  `Азимут ${bearingLabel(sea.point.bearing)}; проверено ${view.sea.length} направлений на берег`,
                  verdictReason(sea.point.line, sea.verdict),
                ]}
              />
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Берега моря ближе 6 км по OpenStreetMap нет.</p>
          )}
        </section>

        <section aria-labelledby="view-side-title" className={card}>
          <h3 id="view-side-title" className="text-lg font-bold">
            Сторона окон
          </h3>
          <div className="flex items-start gap-4">
            <div role="group" aria-label="Сторона света" className="grid shrink-0 grid-cols-3 gap-1">
              {COMPASS.map((id, i) =>
                id ? (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={id === shownSide}
                    title={sideOf(id).label}
                    onClick={() => setSide(id)}
                    className={cn(
                      'size-10 rounded-full text-sm font-semibold',
                      id === shownSide
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
                    )}
                  >
                    {sideOf(id).short}
                  </button>
                ) : (
                  <span key={i} className="flex size-10 items-center justify-center text-muted-foreground" aria-hidden>
                    <Building2 className="size-5" />
                  </span>
                ),
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              На какую сторону выходят окна номеров, ни отель, ни Островок не указывают. Выберите сторону — покажем, что
              видно с неё ({sideOf(shownSide).label.toLocaleLowerCase('ru')},{' '}
              {SIDES.find((s) => s.id === shownSide)!.bearing}° ± 22,5°).
            </p>
          </div>
          {top && summary && !loading && (
            <p className="text-sm">
              Поверх крыш до {distanceLabel(RAY_LENGTH_M)}: {summary.open} из {summary.rays} направлений.{' '}
              {summary.nearestAboveM !== null
                ? `Ближайшее здание выше окна — в ${distanceLabel(summary.nearestAboveM)}.`
                : `Зданий выше окна до ${distanceLabel(RAY_LENGTH_M)} нет.`}
            </p>
          )}
          {top && view && !loading && (
            <ul aria-label="Что видно с этой стороны" className="flex flex-col gap-3">
              {sideSea?.point && (
                <Row
                  icon={Waves}
                  title="Море"
                  verdict={sideSea.verdict}
                  lines={[
                    `берег в ${distanceLabel(sideSea.point.distanceM)}`,
                    verdictReason(sideSea.point.line, sideSea.verdict),
                  ]}
                />
              )}
              {sunInSide && sunset && (
                <Row
                  icon={Sunset}
                  title="Закат"
                  verdict={sunVerdict}
                  lines={[`азимут ${Math.round(sunset.azimuth)}°`]}
                />
              )}
              {inView.map(({ target, verdict }) => (
                <Row
                  key={`${target.kind}-${target.name}`}
                  icon={Landmark}
                  title={target.name}
                  verdict={verdict}
                  lines={targetLines(target, verdict)}
                />
              ))}
              {!sideSea?.point && !sunInSide && inView.length === 0 && (
                <li className="text-sm text-muted-foreground">Моря, заката и ориентиров с этой стороны нет.</li>
              )}
            </ul>
          )}
        </section>
      </div>

      {top && view && landmarks.length > 0 && (
        <section aria-labelledby="view-landmarks-title" className={card}>
          <h3 id="view-landmarks-title" className="text-lg font-bold">
            Ориентиры до 3 км
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {landmarks.map(({ target, verdict }) => (
              <Row
                key={`${target.kind}-${target.name}`}
                icon={Landmark}
                title={target.name}
                verdict={verdict}
                lines={targetLines(target, verdict)}
              />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Места Островка и достопримечательности OpenStreetMap (tourism=attraction). Станции и аэропорты не проверяем.
          </p>
        </section>
      )}

      <details className={cn(card, 'gap-2')}>
        <summary className="cursor-pointer font-semibold">Как мы считаем</summary>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          {VIEW_ASSUMPTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>
            Источники:{' '}
            <a
              href="https://eubucco.com/data/download/v0.2"
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline"
            >
              EUBUCCO v0.2
            </a>{' '}
            (здания и высоты),{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline"
            >
              © OpenStreetMap
            </a>{' '}
            (берег, достопримечательности), Островок (места рядом); солнце — астрономический расчёт (приближение NOAA).
          </li>
        </ul>
      </details>
    </section>
  )
}
