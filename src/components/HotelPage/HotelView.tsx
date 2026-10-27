'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { Building2, ChevronDown, Landmark, Sunrise, Sunset, Waves } from 'lucide-react'
import { cn } from 'cn'
import { Slider } from '@/components/ui/slider'
import type { Hotel } from '@/lib/catalog'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import { todayIso } from '@/lib/dates'
import { distanceLabel, type HotelBuilding } from '@/lib/hotelDetails'
import {
  bearingLabel,
  blockersAt,
  eyeOf,
  floorLabel,
  fromFloor,
  inSide,
  lineVerdict,
  localTime,
  RAY_LENGTH_M,
  reachLabel,
  reachVerdict,
  seaReach,
  sideOf,
  sideSummary,
  SIDES,
  openestSide,
  SUN_CHECK_ALTITUDE_DEG,
  sunBlockers,
  sunReach,
  sunriseOf,
  sunriseRange,
  sunsetOf,
  sunsetRange,
  targetReach,
  VERDICT_LABEL,
  verdictReason,
  VIEW_ASSUMPTIONS,
  windowLabel,
  windowOf,
  type HotelView as HotelViewData,
  type Reach,
  type SideId,
  type SightLine,
  type Verdict,
  type ViewTarget,
} from '@/lib/view'
import { HotelMapUnavailable } from './HotelMapUnavailable'
import {
  BLOCKER_COLOR,
  HOTEL_BUILDING_COLOR,
  SECTOR_COLOR,
  SUNRISE_COLOR,
  SUNSET_COLOR,
  VERDICT_COLOR,
} from './viewColors'

// MapLibre is loaded only in the browser.
const ViewMap = dynamic(() => import('./ViewMap').catch(() => ({ default: () => <HotelMapUnavailable /> })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const card = 'flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)'
/** The landmarks shown before «Показать все»: a hotel in the centre has up to 20. */
export const LANDMARKS_SHOWN = 8

const VERDICT_CLASS: Record<Verdict, string> = {
  visible: 'bg-success-soft text-success-foreground',
  obstructed: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  unknown: 'bg-muted text-muted-foreground',
}

/** Today never changes while the page is open: nothing to subscribe to. */
const noChanges = () => () => {}

/** The compass as a 3×3 grid: the sides around the building. */
const COMPASS: (SideId | null)[] = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se']

/** «254° (запад)» kept on one line. */
const unbroken = (text: string) => text.replace(/ /g, ' ')

/** The view from every floor (`GET /api/hotels/<id>/view`): `null` while it comes and when there is none. */
function useView(hotelId: string, enabled: boolean) {
  const [state, setState] = useState<{ key: string; view: HotelViewData | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/view`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ view: HotelViewData | null }>) : null))
      .then((body) => setState({ key: hotelId, view: body?.view ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key: hotelId, view: null })
      })
    return () => controller.abort()
  }, [hotelId, enabled])
  return { view: state?.view ?? null, loading: enabled && state?.key !== hotelId }
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

function ReachBadge({ reach }: { reach: Reach }) {
  return (
    <span
      className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', VERDICT_CLASS[reachVerdict(reach)])}
    >
      {reachLabel(reach)}
    </span>
  )
}

/** A line of a list: the icon, what is checked and how far, from which floor it is seen and why. */
function Row({
  icon: Icon,
  title,
  lines,
  reach,
}: {
  icon: typeof Waves
  title: string
  lines: (string | null | false | undefined)[]
  reach: Reach
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{title}</span>
          <ReachBadge reach={reach} />
        </span>
        {lines.filter(Boolean).map((line) => (
          <span key={line as string} className="text-sm text-pretty text-muted-foreground">
            {line}
          </span>
        ))}
      </span>
    </li>
  )
}

/** «С 12-го этажа — возможны препятствия: мешает здание …». */
function floorLine(line: SightLine | null | undefined, floor: number, eyeM: number, angle = 0) {
  const verdict = lineVerdict(line, eyeM, angle)
  const reason = verdictReason(line ?? null, verdict, eyeM, angle)
  const from = fromFloor(floor)
  return `${from.charAt(0).toLocaleUpperCase('ru')}${from.slice(1)} этажа — ${VERDICT_LABEL[verdict]}${reason ? `: ${reason}` : ''}`
}

const targetLines = (target: ViewTarget, floor: number, eyeM: number) => [
  `${target.category} · ${distanceLabel(target.distanceM)} · азимут ${unbroken(bearingLabel(target.bearing))}`,
  floorLine(target.line, floor, eyeM),
]

/** The legend of the map, over it on a wide screen and above it on a narrow one. */
function Legend({ side, floor }: { side: SideId; floor: number | null }) {
  const lineItem = (color: string, label: string, dashed = false) => (
    <li key={label} className="flex items-center gap-1.5">
      <span
        className={cn('w-4 shrink-0 rounded-full', dashed ? 'h-0 border-t-2 border-dashed' : 'h-1')}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
        aria-hidden
      />
      {label}
    </li>
  )
  const boxItem = (color: string, label: string, opacity = 1) => (
    <li key={label} className="flex items-center gap-1.5">
      <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: color, opacity }} aria-hidden />
      {label}
    </li>
  )
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card p-2.5 text-xs text-foreground shadow-sm md:pointer-events-none md:absolute md:top-2 md:left-2 md:max-w-64 md:bg-white/90 md:dark:bg-card/90">
      <span className="font-semibold">
        Вверху — {sideOf(side).label.toLocaleLowerCase('ru')}
        {floor ? `, вид ${fromFloor(floor)} этажа` : ''}
      </span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        {boxItem(SECTOR_COLOR, 'сторона окон', 0.3)}
        {lineItem(SUNSET_COLOR, 'закат')}
        {lineItem(SUNRISE_COLOR, 'восход')}
        {lineItem(VERDICT_COLOR.visible, 'видно', true)}
        {lineItem(VERDICT_COLOR.obstructed, 'есть помехи', true)}
        {lineItem(VERDICT_COLOR.unknown, 'нет данных', true)}
        {boxItem(HOTEL_BUILDING_COLOR, 'отель')}
        {boxItem(BLOCKER_COLOR, 'здание мешает')}
      </ul>
    </div>
  )
}

/**
 * «Вид из отеля» of a real hotel: from which floor the sea, the sunset and the sunrise of a date and the attractions of
 * OSM and the places of Ostrovok are seen, by the lines of sight over the buildings of EUBUCCO; the slider picks a
 * floor (1 to the top one: EUBUCCO's building, else the floors the rooms take) and the map and the lists show what is
 * seen from it; the compass picks the side of the windows, which no data gives yet. The map stands EUBUCCO's buildings
 * around the hotel, turned to the side. With neither a building's height nor the rooms' floors: «нет точных данных».
 */
export function HotelView({
  hotel,
  building,
  roomFloors,
}: {
  hotel: Hotel
  building: HotelBuilding | null | undefined
  roomFloors: number | null | undefined
}) {
  const viewWindow = windowOf(building, roomFloors)
  const [picked, setPickedFloor] = useState<number | null>(null)
  const floor = viewWindow ? Math.min(picked ?? viewWindow.floors, viewWindow.floors) : null
  const { view, loading } = useView(hotel.id, Boolean(viewWindow))
  const buildings = useViewMap(hotel.id)
  const [failed, setFailed] = useState(false)
  // The date is the visitor's today in the browser (the prerendered page has none) until one is picked.
  const today = useSyncExternalStore(noChanges, todayIso, () => '')
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const date = pickedDate ?? today
  const [side, setSide] = useState<SideId | null>(null)
  const [allLandmarks, setAllLandmarks] = useState(false)

  const eyeM = viewWindow && floor ? eyeOf(viewWindow, floor) : 0
  const ready = view && !loading && floor ? view : null
  // The side the page opens on is the openest from the top floor: it does not jump with the slider.
  const shownSide = side ?? (ready ? openestSide(ready.rays, eyeOf(ready.window, ready.window.floors)) : 'w')
  const year = Number(date.slice(0, 4))
  const sunset = date ? sunsetOf(date, hotel.lat, hotel.lon) : null
  const sunrise = date ? sunriseOf(date, hotel.lat, hotel.lon) : null
  const setRange = date ? sunsetRange(year, hotel.lat, hotel.lon) : null
  const riseRange = date ? sunriseRange(year, hotel.lat, hotel.lon) : null
  const sunsetSun = ready && sunset ? sunReach(ready, sunset.checkAzimuth) : null
  const sunriseSun = ready && sunrise ? sunReach(ready, sunrise.checkAzimuth) : null
  const sea = ready ? seaReach(ready) : null
  const sideSea = ready ? seaReach(ready, shownSide) : null
  const landmarks = useMemo(
    () => (ready ? ready.landmarks.map((target) => ({ target, reach: targetReach(target, ready.window) })) : []),
    [ready],
  )
  const inView = landmarks.filter(({ target }) => inSide(target.bearing, shownSide))
  const summary = ready ? sideSummary(ready.rays, shownSide, eyeM) : null
  const mapTargets = [...(sideSea?.point ? [sideSea.point] : []), ...inView.map(({ target }) => target)].map((t) => ({
    lat: t.lat,
    lon: t.lon,
    verdict: lineVerdict(t.line, eyeM),
  }))
  const blockers = [
    ...sunBlockers(sunsetSun?.ray, eyeM),
    ...sunBlockers(sunriseSun?.ray, eyeM),
    ...(sideSea?.point ? blockersAt(sideSea.point.line, eyeM) : []),
    ...inView.flatMap(({ target }) => blockersAt(target.line, eyeM)),
  ].map((b) => b.id)
  const sunInSide = sunset && inSide(sunset.azimuth, shownSide)
  const riseInSide = sunrise && inSide(sunrise.azimuth, shownSide)
  const unknown: Reach = { kind: 'unknown' }

  return (
    <section id="view" tabIndex={-1} aria-labelledby="view-title" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-col gap-1">
        <h2 id="view-title" className="text-heading font-bold">
          Вид из отеля
        </h2>
        <p className="text-muted-foreground">
          С какого этажа видно море, закат, восход и места рядом — по высотам зданий EUBUCCO и линии взгляда над
          крышами.
        </p>
      </div>

      <div className="flex flex-col gap-2 md:relative">
        {!failed && <Legend side={shownSide} floor={ready ? floor : null} />}
        <div className="relative h-[clamp(18rem,55vw,28rem)] overflow-hidden rounded-2xl bg-muted md:order-first">
          {failed ? (
            <HotelMapUnavailable />
          ) : (
            <ViewMap
              center={{ lat: hotel.lat, lon: hotel.lon }}
              buildings={buildings}
              bearing={sideOf(shownSide).bearing}
              sunsetAzimuth={sunset?.azimuth ?? null}
              sunriseAzimuth={sunrise?.azimuth ?? null}
              targets={mapTargets}
              blockers={blockers}
              hotelBuilding={view?.ownBuilding ?? null}
              onFail={() => setFailed(true)}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="view-window-title" className={card}>
          <h3 id="view-window-title" className="text-lg font-bold">
            Окно
          </h3>
          {viewWindow && floor ? (
            <>
              <p className="flex gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-col">
                  <b>{windowLabel(viewWindow)}</b>
                  <span className="text-sm text-muted-foreground">{floorLabel(viewWindow, floor)}</span>
                </span>
              </p>
              {viewWindow.floors > 1 && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center justify-between gap-3 text-sm">
                    <span>Этаж</span>
                    <b>
                      {floor}-й{floor === viewWindow.floors ? ' (верхний)' : ''}
                    </b>
                  </span>
                  <Slider
                    min={1}
                    max={viewWindow.floors}
                    step={1}
                    value={[floor]}
                    thumbLabels={['Этаж']}
                    onValueChange={(value) => setPickedFloor((value as number[])[0])}
                  />
                  <span className="flex justify-between text-xs text-muted-foreground" aria-hidden>
                    <span>1</span>
                    <span>{viewWindow.floors}</span>
                  </span>
                </div>
              )}
              <p className="text-xs text-pretty text-muted-foreground">
                Из какого окна смотрит номер, неизвестно: проверяем каждый этаж и пишем, с какого видна цель.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Нет точных данных.</p>
          )}
        </section>

        <section aria-labelledby="view-sun-title" className={card}>
          <h3 id="view-sun-title" className="text-lg font-bold">
            Закат и восход
          </h3>
          <label className="flex items-center justify-between gap-3 text-sm">
            Дата
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && setPickedDate(event.target.value)}
              className="rounded-lg border border-input bg-background px-2 py-1"
            />
          </label>
          {sunset || sunrise ? (
            <ul className="flex flex-col gap-3">
              {sunset && (
                <Row
                  icon={Sunset}
                  title={`Закат в ${localTime(sunset.at)}`}
                  reach={sunsetSun?.reach ?? unknown}
                  lines={[
                    `Азимут ${unbroken(bearingLabel(sunset.azimuth))}${setRange ? `, за год — от ${unbroken(`${Math.round(setRange.winter)}° зимой`)} до ${unbroken(`${Math.round(setRange.summer)}° летом`)}` : ''}.`,
                    `Солнце на ${SUN_CHECK_ALTITUDE_DEG}° над горизонтом — в ${localTime(sunset.checkAt)}, азимут ${Math.round(sunset.checkAzimuth)}°.`,
                    ready && floor ? floorLine(sunsetSun?.ray?.line, floor, eyeM, 1) : null,
                  ]}
                />
              )}
              {sunrise && (
                <Row
                  icon={Sunrise}
                  title={`Восход в ${localTime(sunrise.at)}`}
                  reach={sunriseSun?.reach ?? unknown}
                  lines={[
                    `Азимут ${unbroken(bearingLabel(sunrise.azimuth))}${riseRange ? `, за год — от ${unbroken(`${Math.round(riseRange.summer)}° летом`)} до ${unbroken(`${Math.round(riseRange.winter)}° зимой`)}` : ''}.`,
                    `Солнце на ${SUN_CHECK_ALTITUDE_DEG}° над горизонтом — в ${localTime(sunrise.checkAt)}, азимут ${Math.round(sunrise.checkAzimuth)}°.`,
                    ready && floor ? floorLine(sunriseSun?.ray?.line, floor, eyeM, 1) : null,
                  ]}
                />
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Выберите дату.</p>
          )}
        </section>

        <section aria-labelledby="view-sea-title" className={card}>
          <h3 id="view-sea-title" className="text-lg font-bold">
            Море
          </h3>
          {!viewWindow ? (
            <p className="text-sm text-muted-foreground">Нет точных данных.</p>
          ) : loading ? (
            <p className="h-12 animate-pulse rounded-xl bg-muted" aria-label="Проверяем" />
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">Не удалось проверить — нет данных.</p>
          ) : !ready.seaChecked ? (
            <p className="text-sm text-muted-foreground">Берег моря OpenStreetMap у отеля не загружен — нет данных.</p>
          ) : sea?.point && floor ? (
            <ul className="flex flex-col gap-3">
              <Row
                icon={Waves}
                title={`Берег в ${distanceLabel(sea.point.distanceM)}`}
                reach={sea.reach}
                lines={[
                  `Азимут ${unbroken(bearingLabel(sea.point.bearing))}; проверено ${ready.sea.length} направлений на берег.`,
                  floorLine(sea.point.line, floor, eyeM),
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
          {ready && summary && floor && (
            <p className="text-sm">
              Поверх крыш до {distanceLabel(RAY_LENGTH_M)} {fromFloor(floor)} этажа: {summary.open} из {summary.rays}{' '}
              направлений.
            </p>
          )}
          {ready && floor && (
            <ul aria-label="Что видно с этой стороны" className="flex flex-col gap-3">
              {sideSea?.point && (
                <Row
                  icon={Waves}
                  title="Море"
                  reach={sideSea.reach}
                  lines={[`берег в ${distanceLabel(sideSea.point.distanceM)}`]}
                />
              )}
              {sunInSide && sunset && (
                <Row
                  icon={Sunset}
                  title="Закат"
                  reach={sunsetSun?.reach ?? unknown}
                  lines={[`азимут ${Math.round(sunset.azimuth)}°`]}
                />
              )}
              {riseInSide && sunrise && (
                <Row
                  icon={Sunrise}
                  title="Восход"
                  reach={sunriseSun?.reach ?? unknown}
                  lines={[`азимут ${Math.round(sunrise.azimuth)}°`]}
                />
              )}
              {inView.map(({ target, reach }, i) => (
                <Row
                  key={`${target.kind}-${target.name}-${i}`}
                  icon={Landmark}
                  title={target.name}
                  reach={reach}
                  lines={[`${target.category} · ${distanceLabel(target.distanceM)}`]}
                />
              ))}
              {!sideSea?.point && !sunInSide && !riseInSide && inView.length === 0 && (
                <li className="text-sm text-muted-foreground">Моря, солнца и ориентиров с этой стороны нет.</li>
              )}
            </ul>
          )}
        </section>
      </div>

      {ready && floor && landmarks.length > 0 && (
        <section aria-labelledby="view-landmarks-title" className={card}>
          <h3 id="view-landmarks-title" className="text-lg font-bold">
            Ориентиры до 3 км
          </h3>
          <ul id="view-landmarks-list" className="grid gap-3 md:grid-cols-2">
            {(allLandmarks ? landmarks : landmarks.slice(0, LANDMARKS_SHOWN)).map(({ target, reach }, i) => (
              <Row
                key={`${target.kind}-${target.name}-${i}`}
                icon={Landmark}
                title={target.name}
                reach={reach}
                lines={targetLines(target, floor, eyeM)}
              />
            ))}
          </ul>
          {landmarks.length > LANDMARKS_SHOWN && (
            <button
              type="button"
              aria-expanded={allLandmarks}
              aria-controls="view-landmarks-list"
              className="flex items-center gap-1 self-start font-semibold text-primary"
              onClick={() => setAllLandmarks((open) => !open)}
            >
              {allLandmarks ? 'Свернуть' : `Показать все (${landmarks.length})`}
              <ChevronDown className={cn('size-4 transition-transform', allLandmarks && 'rotate-180')} aria-hidden />
            </button>
          )}
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
            (берег, достопримечательности), Островок (места рядом, этажи номеров); солнце — астрономический расчёт
            (приближение NOAA).
          </li>
        </ul>
      </details>
    </section>
  )
}
