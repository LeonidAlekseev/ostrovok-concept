'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Building2, Car, Factory, Moon, Plane, Sun, Sunset, TrainFront, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import type { NoiseMap as NoiseMapData } from '@/lib/db/noise'
import { bandLabel, type NoiseBand } from '@/lib/features'
import { countRu } from '@/lib/format'
import { distanceLabel, type HotelBuilding } from '@/lib/hotelDetails'
import {
  CURVE_NOTE,
  dayCurve,
  dayEstimate,
  dayLabel,
  EEA_NOISE_URL,
  hasEeaNoise,
  LEGEND_STEPS,
  loudestSource,
  NO_EEA,
  NOISE_COLORS,
  NOISE_MAP_RADIUS_M,
  noiseColor,
  noiseSourceLabel,
  NOISY_CATEGORIES,
  NOISY_GROUPS,
  NOISY_LABEL,
  NOISY_RADIUS_M,
  whoLine,
  type HotelNoise as HotelNoiseData,
  type NoiseIndicator,
  type NoisyPlace,
} from '@/lib/noise'
import { HotelMapUnavailable } from './HotelMapUnavailable'

// MapLibre is loaded only in the browser.
const NoiseMap = dynamic(() => import('./NoiseMap').catch(() => ({ default: () => <HotelMapUnavailable /> })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const card = 'flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)'

const SOURCE_ICON: Readonly<Record<string, LucideIcon>> = {
  roadsInAgglomeration: Car,
  majorRoadsIncludingAgglomeration: Car,
  railwaysInAgglomeration: TrainFront,
  majorRailwaysIncludingAgglomeration: TrainFront,
  industryInAgglomeration: Factory,
  majorAirportsIncludingAgglomeration: Plane,
}

const INDICATOR_LABEL: Record<NoiseIndicator, string> = { Lden: 'За сутки', Lnight: 'Ночью' }

/** The places of OSM shown in the list. */
const PLACES_SHOWN = 6

/** The noise contours of the hotel (`GET /api/hotels/<id>/noise-map`): `null` until they come and on a failure. */
function useNoiseMap(hotelId: string) {
  const [map, setMap] = useState<NoiseMapData | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/noise-map`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ map: NoiseMapData | null }>) : null))
      .then((body) => setMap(body?.map ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [hotelId])
  return map
}

/**
 * The legend of the map: the colours of the bands, the quiet below 40 dB first, each under its lower bound, and the
 * dots of the loud places shown.
 */
function Legend({ indicator, places }: { indicator: NoiseIndicator; places: readonly NoisyPlace[] }) {
  const groups = NOISY_GROUPS.filter((g) => places.some((p) => g.categories.includes(p.category)))
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card p-2.5 text-xs text-foreground shadow-sm sm:bg-white/90 sm:dark:bg-card/90">
      <span className="font-semibold">
        {indicator}, дБ ({INDICATOR_LABEL[indicator].toLocaleLowerCase('ru')})
      </span>
      <ul className="flex">
        {NOISE_COLORS.map((color, i) => (
          <li key={color} className="flex w-7 flex-col gap-1">
            <span className="h-2 w-full" style={{ backgroundColor: color }} aria-hidden />
            <span className="text-[0.625rem] text-muted-foreground">
              {i === 0 ? `<${LEGEND_STEPS[0]}` : LEGEND_STEPS[i - 1]}
              {i === LEGEND_STEPS.length && '+'}
            </span>
          </li>
        ))}
      </ul>
      {groups.length > 0 && (
        <ul aria-label="Шумные места на карте" className="flex flex-wrap gap-x-3 gap-y-1">
          {groups.map((g) => (
            <li key={g.label} className="flex items-center gap-1.5">
              <span
                className="size-3 shrink-0 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: g.color }}
                aria-hidden
              />
              {g.label}
            </li>
          ))}
        </ul>
      )}
      <span className="text-[0.625rem] text-muted-foreground">
        Без цвета — нет контура EEA или дальше {NOISE_MAP_RADIUS_M} м от отеля
      </span>
    </div>
  )
}

function NoiseMapCard({ hotel, noise }: { hotel: Hotel; noise: HotelNoiseData }) {
  const contours = useNoiseMap(hotel.id)
  const [indicator, setIndicator] = useState<NoiseIndicator>('Lden')
  const [failed, setFailed] = useState(false)
  return (
    // On a phone the legend and the switch stand above the map, from `sm` on it.
    <div className="flex flex-col gap-2 sm:relative">
      {!failed && (
        <div className="flex flex-wrap items-start justify-between gap-2 sm:pointer-events-none sm:absolute sm:inset-x-2 sm:top-2 sm:z-1">
          <Legend indicator={indicator} places={noise.places} />
          <div
            role="group"
            aria-label="Показатель шума"
            className="pointer-events-auto flex rounded-full bg-card p-1 text-sm shadow-sm sm:bg-white sm:dark:bg-card"
          >
            {(['Lden', 'Lnight'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={indicator === value}
                className={cn(
                  'rounded-full px-3 py-1 font-semibold',
                  indicator === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
                onClick={() => setIndicator(value)}
              >
                {INDICATOR_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="h-[clamp(18rem,55vw,28rem)] overflow-hidden rounded-2xl bg-muted">
        {failed ? (
          <HotelMapUnavailable />
        ) : (
          <NoiseMap
            center={{ lat: hotel.lat, lon: hotel.lon }}
            contours={contours}
            indicator={indicator}
            places={noise.places}
            onFail={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  )
}

function Band({ band }: { band: NoiseBand }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: noiseColor(band.min ?? 0) }}
        aria-hidden
      />
      {bandLabel(band)}
    </span>
  )
}

/** The loudest bands, the WHO lines and the day, evening and night tiles. */
function LevelCard({ noise }: { noise: HotelNoiseData }) {
  const lden = loudestSource(noise, 'Lden')
  const lnight = loudestSource(noise, 'Lnight')
  const day = lden && dayEstimate(lden.lden, lden.lnight)
  const tiles = [
    { icon: Sun, label: 'День', value: day ? dayLabel(day) : 'нет оценки', note: '07–19, оценка' },
    { icon: Sunset, label: 'Вечер', value: day ? dayLabel(day) : 'нет оценки', note: '19–23, как днём' },
    { icon: Moon, label: 'Ночь', value: lnight ? bandLabel(lnight.lnight!) : 'нет данных', note: '23–07, EEA' },
  ]
  const rows = [
    ...(lden ? [{ indicator: 'Lden' as const, source: lden, band: lden.lden! }] : []),
    ...(lnight ? [{ indicator: 'Lnight' as const, source: lnight, band: lnight.lnight! }] : []),
  ]
  return (
    <section aria-labelledby="noise-level-title" className={card}>
      <h3 id="noise-level-title" className="text-lg font-bold">
        Уровень шума у отеля
      </h3>
      <dl className="flex flex-col gap-2">
        {rows.map(({ indicator, source, band }) => {
          const who = whoLine(source, indicator)
          return (
            <div key={indicator} className="flex flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">
                {INDICATOR_LABEL[indicator]} ({indicator})
              </dt>
              <dd className="flex flex-col">
                <b className="text-xl">
                  <Band band={band} />
                </b>
                <span className="text-sm text-muted-foreground">
                  {noiseSourceLabel(source.source)}
                  {who && `; ${who}`}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
      <ul className="grid grid-cols-3 gap-2">
        {tiles.map(({ icon: Icon, label, value, note }) => (
          <li key={label} className="flex flex-col gap-0.5 rounded-xl bg-secondary p-2.5">
            <span className="flex items-center gap-1.5 text-sm">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
            </span>
            <b>{value}</b>
            <span className="text-xs text-muted-foreground">{note}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        EEA даёт полосу в 5 дБ, а не точное значение; метода расчёта и погрешности в наборе нет.
      </p>
    </section>
  )
}

const hourLabel = (halfHour: number) =>
  `${String(Math.floor(halfHour / 2)).padStart(2, '0')}:${halfHour % 2 ? '30' : '00'}`

/** The 24 hours of `dayCurve` as bars, coloured by level. */
function DayCurveCard({ noise }: { noise: HotelNoiseData }) {
  const curve = dayCurve(noise)
  const floor = 30
  const top = Math.max(80, ...(curve?.levels ?? []))
  return (
    <section aria-labelledby="noise-day-title" className={card}>
      <h3 id="noise-day-title" className="text-lg font-bold">
        Шум в течение суток
      </h3>
      {curve ? (
        <>
          <div
            role="img"
            aria-label={`Оценка по часам: ночью около ${Math.round(curve.night)} дБ, днём и вечером около ${Math.round(curve.day)} дБ`}
            className="flex h-20 items-end gap-px"
          >
            {curve.levels.map((level, i) => (
              <span
                key={i}
                title={`${hourLabel(i)} ≈ ${Math.round(level)} дБ`}
                className="flex-1 rounded-t-sm"
                style={{ height: `${((level - floor) / (top - floor)) * 100}%`, backgroundColor: noiseColor(level) }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Иллюстрация, а не измерение. Ночь — середина полосы Lnight; день вычислен из Lden и Lnight по формуле
            директивы ЕС 2002/49/EC при допущении, что вечером так же шумно, как днём (и днём не тише, чем ночью);
            переходы около 07:00 и 23:00 сглажены. {CURVE_NOTE}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          График не строим: для оценки нужны закрытые полосы Lden и Lnight одного источника, а у отеля их нет.
        </p>
      )}
    </section>
  )
}

/** The EEA layers at the point and the loud places of OSM nearby. */
function SourcesCard({ noise }: { noise: HotelNoiseData }) {
  const places = noise.places.slice(0, PLACES_SHOWN)
  return (
    <section aria-labelledby="noise-sources-title" className={card}>
      <h3 id="noise-sources-title" className="text-lg font-bold">
        Источники шума
      </h3>
      {noise.sources.length > 0 ? (
        <ul aria-label="Карты шума EEA" className="flex flex-col gap-2.5">
          {noise.sources.map((s) => {
            const Icon = SOURCE_ICON[s.source] ?? Car
            return (
              <li key={s.source} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-semibold">{noiseSourceLabel(s.source)}</span>
                  <span className="text-sm text-muted-foreground">
                    {[s.lden && `${bandLabel(s.lden)} за сутки`, s.lnight && `${bandLabel(s.lnight)} ночью`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Карты шума EEA у отеля данных не дают.</p>
      )}
      <h4 className="font-semibold">Шумные места рядом, до {NOISY_RADIUS_M} м</h4>
      {places.length > 0 ? (
        <ul aria-label="Шумные места рядом" className="flex flex-col gap-1.5 text-sm">
          {places.map((place) => (
            <li
              key={`${place.category}-${place.lat}-${place.lon}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 truncate">
                {place.name ?? 'Без названия'}{' '}
                <span className="text-muted-foreground">· {NOISY_LABEL[place.category][0]}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{distanceLabel(place.distanceM)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {noise.placesCovered.length === NOISY_CATEGORIES.length
            ? 'Баров, клубов, ресторанов и остановок рядом по OpenStreetMap нет.'
            : 'Нет данных OpenStreetMap о местах рядом.'}
        </p>
      )}
      {noise.places.length > PLACES_SHOWN && (
        <p className="text-sm text-muted-foreground">
          Всего {countRu(noise.places.length, ['место', 'места', 'мест'])} в {NOISY_RADIUS_M} м.
        </p>
      )}
    </section>
  )
}

/** The building at the hotel's point (EUBUCCO); a model's estimate is marked. None for a doubtful one. */
function BuildingCard({ building }: { building: HotelBuilding }) {
  const floorsApprox = building.estimated ? '≈' : ''
  const heightApprox = building.heightEstimated || building.estimated ? '≈' : ''
  const estimated = building.estimated || building.heightEstimated
  return (
    <section aria-labelledby="noise-building-title" className={card}>
      <h3 id="noise-building-title" className="text-lg font-bold">
        Здание отеля
      </h3>
      <p className="flex gap-3">
        <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex flex-col">
          <b>
            {[
              building.floors && `${floorsApprox}${countRu(building.floors, ['этаж', 'этажа', 'этажей'])}`,
              building.heightM && `${heightApprox}${Math.round(building.heightM)} м`,
            ]
              .filter(Boolean)
              .join(', ')}
          </b>
          <span className="text-sm text-muted-foreground">
            EUBUCCO{estimated ? `, ${building.estimated ? '' : 'высота '}по оценке модели` : ''}.
          </span>
        </span>
      </p>
    </section>
  )
}

function DataCard({ building }: { building: boolean }) {
  return (
    <section aria-labelledby="noise-data-title" className={card}>
      <h3 id="noise-data-title" className="text-lg font-bold">
        Источники данных
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>
          <a href={EEA_NOISE_URL} target="_blank" rel="noopener" className="text-primary hover:underline">
            Карты шума EEA
          </a>{' '}
          по директиве 2002/49/EC, раунд 2022: полосы Lden и Lnight
        </li>
        <li>
          Места рядом —{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener"
            className="text-primary hover:underline"
          >
            © OpenStreetMap
          </a>
        </li>
        {building && <li>Здание — EUBUCCO v0.2</li>}
        <li>Рекомендации ВОЗ по шуму для Европейского региона, 2018</li>
      </ul>
    </section>
  )
}

/**
 * «Шум и окружение» of a real hotel: the EEA contours around it on the map, the bands at its point with the day
 * estimate, the hours of a day, the sources (EEA's layers and OSM's loud places), the building and the data's sources.
 * A hotel outside EEA's maps says «нет данных EEA», never «тихо».
 */
export function HotelNoise({
  hotel,
  noise,
  building,
}: {
  hotel: Hotel
  noise: HotelNoiseData
  building?: HotelBuilding | null
}) {
  const eea = hasEeaNoise(noise)
  return (
    <section id="noise" tabIndex={-1} aria-labelledby="noise-title" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-col gap-1">
        <h2 id="noise-title" className="text-heading font-bold">
          Шум и окружение
        </h2>
        <p className="text-muted-foreground">По картам шума EEA и местам OpenStreetMap вокруг отеля.</p>
      </div>
      <NoiseMapCard hotel={hotel} noise={noise} />
      <div className="grid gap-4 md:grid-cols-2">
        {eea ? (
          <>
            <LevelCard noise={noise} />
            <DayCurveCard noise={noise} />
          </>
        ) : (
          <p className={cn(card, 'md:col-span-2')}>{NO_EEA}. Это не значит, что здесь тихо.</p>
        )}
        <SourcesCard noise={noise} />
        {building && (building.floors || building.heightM) ? <BuildingCard building={building} /> : null}
        <DataCard building={Boolean(building)} />
      </div>
    </section>
  )
}
