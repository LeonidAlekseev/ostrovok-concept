'use client'

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Building2, ChevronDown, Landmark, Sunrise, Sunset, Waves } from 'lucide-react'
import { cn } from 'cn'
import { MapUnavailable } from '@/components/MapUnavailable/MapUnavailable'
import { Slider } from '@/components/ui/slider'
import type { Hotel } from '@/lib/catalog'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import { todayIso } from '@/lib/dates'
import { countRu } from '@/lib/format'
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
  reachTone,
  seaReach,
  seaSeen,
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
  VERDICT_TONE,
  verdictText,
  VIEW_ASSUMPTIONS,
  windowLabel,
  windowOf,
  windowSideLabel,
  type HotelView as HotelViewData,
  type Reach,
  type SideId,
  type SightLine,
  type Tone,
  type ViewTarget,
} from '@/lib/view'
import { useHotelJson } from './useHotelJson'
import {
  BLOCKER_COLOR,
  HOTEL_BUILDING_COLOR,
  SECTOR_COLOR,
  SUNRISE_COLOR,
  SUNSET_COLOR,
  TONE_COLOR,
} from './viewColors'

// MapLibre is loaded only in the browser.
const ViewMap = dynamic(() => import('./ViewMap').catch(() => ({ default: () => <MapUnavailable /> })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const card = 'flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)'
/** The landmarks shown before «Показать все»: a hotel in the centre has up to 20. */
export const LANDMARKS_SHOWN = 8

const TONE_CLASS: Record<Tone, string> = {
  seen: 'bg-success-soft text-success-foreground',
  partly: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  closed: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  unknown: 'bg-muted text-muted-foreground',
}

/** Today never changes while the page is open: nothing to subscribe to. */
const noChanges = () => () => {}

/** The compass as a 3×3 grid: the sides around the building. */
const COMPASS: (SideId | null)[] = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se']

/** «254° (запад)» kept on one line. */
const unbroken = (text: string) => text.replace(/ /g, ' ')

function ReachBadge({ reach }: { reach: Reach }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE_CLASS[reachTone(reach)])}>
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

/** «Со 2-го этажа»: the start of a line about a floor. */
const fromFloorTitle = (floor: number) => {
  const from = fromFloor(floor)
  return `${from.charAt(0).toLocaleUpperCase('ru')}${from.slice(1)} этажа`
}

/** «Со 2-го этажа — закрыто зданием ≈ 17,2 м (по оценке EUBUCCO) в 80 м от отеля». */
const floorLine = (line: SightLine | null | undefined, floor: number, eyeM: number, angle = 0) =>
  `${fromFloorTitle(floor)} — ${verdictText(line, eyeM, angle)}`

const targetLines = (target: ViewTarget, floor: number, eyeM: number) => [
  `${target.category} · ${distanceLabel(target.distanceM)} · азимут ${unbroken(bearingLabel(target.bearing))}`,
  floorLine(target.line, floor, eyeM),
]

/** The tones of the lines of sight in the legend, as the map colours them. */
const TONE_LEGEND: { tone: Tone; label: string }[] = [
  { tone: 'seen', label: 'видно' },
  { tone: 'partly', label: 'частично или возможно' },
  { tone: 'closed', label: 'закрыто' },
  { tone: 'unknown', label: 'нет данных' },
]

/** The legend of the map, over it on a wide screen and above it on a narrow one: the window, then a row a kind. */
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
  const group = (title: string, items: ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{title}</span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">{items}</ul>
    </div>
  )
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-2.5 text-xs text-foreground shadow-sm md:pointer-events-none md:absolute md:top-2 md:left-2 md:max-w-72 md:bg-white/90 md:dark:bg-card/90">
      <span className="text-sm font-semibold">{windowSideLabel(side, floor)}</span>
      {group(
        'Линия взгляда',
        TONE_LEGEND.map(({ tone, label }) => lineItem(TONE_COLOR[tone], label, true)),
      )}
      {group('Солнце', [lineItem(SUNSET_COLOR, 'закат'), lineItem(SUNRISE_COLOR, 'восход')])}
      {group('Здания и сектор', [
        boxItem(HOTEL_BUILDING_COLOR, 'отель'),
        boxItem(BLOCKER_COLOR, 'закрывает вид'),
        boxItem(SECTOR_COLOR, 'сектор окна', 0.3),
      ])}
    </div>
  )
}

/**
 * «Вид из отеля» of a real hotel: from which floor the sea, the sunset and the sunrise of a date and the attractions of
 * OSM and the places of Ostrovok are seen, by the lines of sight over the buildings of EUBUCCO; the slider picks a
 * floor (1 to the top one: EUBUCCO's building, else the floors the rooms take) and the map and the lists show what is
 * seen from it; the compass beside it («Положение окна») picks the side of the windows, which no data gives yet. The
 * map stands EUBUCCO's buildings around the hotel, turned to the side, with the lines to the sea and the landmarks of
 * the side. Every block says the verdicts of the same functions (src/lib/view.ts). With neither a building's height
 * nor the rooms' floors: «нет точных данных».
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
  // The view from every floor, asked only when the floors of the window are known.
  const { value: view, loading } = useHotelJson<HotelViewData>(hotel.id, 'view', 'view', Boolean(viewWindow))
  // The buildings around the hotel for the map.
  const { value: buildings } = useHotelJson<ViewMapData>(hotel.id, 'view-map', 'map')
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
  const seaShown = ready ? seaSeen(ready, eyeM) : null
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
    tone: VERDICT_TONE[lineVerdict(t.line, eyeM)],
  }))
  const blockers = [
    ...sunBlockers(sunsetSun?.ray, eyeM),
    ...sunBlockers(sunriseSun?.ray, eyeM),
    ...(sideSea?.point ? blockersAt(sideSea.point.line, eyeM) : []),
    ...inView.flatMap(({ target }) => blockersAt(target.line, eyeM)),
  ].map((b) => b.id)
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
            <MapUnavailable />
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
        <section aria-labelledby="view-window-title" className={cn(card, 'md:col-span-2')}>
          <h3 id="view-window-title" className="text-lg font-bold">
            Положение окна
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {viewWindow && floor ? (
              <div className="flex flex-col gap-3">
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Нет точных данных.</p>
            )}
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
                    <span
                      key={i}
                      className="flex size-10 items-center justify-center text-muted-foreground"
                      aria-hidden
                    >
                      <Building2 className="size-5" />
                    </span>
                  ),
                )}
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-pretty text-muted-foreground">
                  На какую сторону выходят окна номеров, ни отель, ни Островок не указывают. Выберите сторону — карта
                  повернётся к ней ({sideOf(shownSide).label.toLocaleLowerCase('ru')},{' '}
                  {SIDES.find((s) => s.id === shownSide)!.bearing}° ± 22,5°).
                </p>
                {ready && summary && floor && (
                  <p>
                    Поверх крыш до {distanceLabel(RAY_LENGTH_M)} {fromFloor(floor)} этажа: {summary.open} из{' '}
                    {summary.rays} направлений этой стороны.
                  </p>
                )}
              </div>
            </div>
          </div>
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
                  `Азимут ${unbroken(bearingLabel(sea.point.bearing))}.`,
                  floorLine(sea.point.line, floor, eyeM),
                  seaShown &&
                    `${fromFloorTitle(floor)} море видно в ${seaShown.seen} из ${countRu(seaShown.of, ['направления', 'направлений', 'направлений'])} на берег.`,
                ]}
              />
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Берега моря ближе 6 км по OpenStreetMap нет.</p>
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
