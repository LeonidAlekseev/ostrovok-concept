'use client'

import { useId, useState } from 'react'
import dynamic from 'next/dynamic'
import { Car, Factory, Moon, Plane, Sun, Sunset, TrainFront, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { MapUnavailable } from '@/components/MapUnavailable/MapUnavailable'
import type { Hotel } from '@/lib/catalog'
import type { NoiseMap as NoiseMapData } from '@/lib/db/noise'
import { bandLabel } from '@/lib/features'
import { countRu } from '@/lib/format'
import { distanceLabel } from '@/lib/hotelDetails'
import {
  dayColorLevel,
  dayLabel,
  EEA_NOISE_URL,
  LEGEND_STEPS,
  loudestSource,
  NO_EEA,
  NOISE_COLORS,
  NOISE_ESTIMATE_NOTES,
  NOISE_MAP_LABEL,
  NOISE_MAP_RADIUS_M,
  noiseColor,
  noiseEstimate,
  noiseSourceLabel,
  NOISY_CATEGORIES,
  NOISY_GROUPS,
  NOISY_LABEL,
  NOISY_RADIUS_M,
  venuesLine,
  whoLine,
  type HotelNoise as HotelNoiseData,
  type LevelRange,
  type NoiseEstimate,
  type NoiseMapIndicator,
  type NoisyPlace,
  type SideLevels,
  type SourceNoise,
} from '@/lib/noise'
import type { NoiseWidget } from '@/lib/chatWidget'
import { useHotelJson } from './useHotelJson'

// MapLibre is loaded only in the browser.
const NoiseMap = dynamic(() => import('./NoiseMap').catch(() => ({ default: () => <MapUnavailable /> })), {
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

/** The legend's title of the map's mode. */
const MAP_TITLE: Record<NoiseMapIndicator, string> = {
  Lday: 'Днём, дБ (оценка по Lden и Lnight)',
  Lnight: 'Lnight, дБ (ночью)',
}

/** The places of OSM shown in the list. */
const PLACES_SHOWN = 6

/**
 * The legend of the map: the colours of the bands, the quiet below 40 dB first, each under its lower bound, and the dots of the loud places shown.
 */
function Legend({
  indicator,
  places,
  compact,
}: {
  indicator: NoiseMapIndicator
  places: readonly NoisyPlace[]
  compact: boolean
}) {
  const groups = NOISY_GROUPS.filter((g) => places.some((p) => g.categories.includes(p.category)))
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-xl bg-card p-2.5 text-xs text-foreground shadow-sm',
        !compact && 'sm:bg-white/90 sm:dark:bg-card/90',
      )}
    >
      <span className="font-semibold">{MAP_TITLE[indicator]}</span>
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

function NoiseMapCard({
  hotel,
  noise,
  compact = false,
}: {
  hotel: Pick<Hotel, 'id' | 'lat' | 'lon'>
  noise: HotelNoiseData
  compact?: boolean
}) {
  // The noise contours around the hotel for the map.
  const { value: contours } = useHotelJson<NoiseMapData>(hotel.id, 'noise-map', 'map')
  const [indicator, setIndicator] = useState<NoiseMapIndicator>('Lday')
  const [failed, setFailed] = useState(false)
  return (
    // On a phone and in the chat (`compact`) the legend and the switch stand above the map, from `sm` on it.
    <div className={cn('flex flex-col gap-2', !compact && 'sm:relative')}>
      {!failed && (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-2',
            !compact && 'sm:pointer-events-none sm:absolute sm:inset-x-2 sm:top-2 sm:z-1',
          )}
        >
          <Legend indicator={indicator} places={noise.places} compact={compact} />
          <div
            role="group"
            aria-label="Показатель шума"
            className={cn(
              'pointer-events-auto flex rounded-full bg-card p-1 text-sm shadow-sm',
              !compact && 'sm:bg-white sm:dark:bg-card',
            )}
          >
            {(['Lday', 'Lnight'] as const).map((value) => (
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
                {NOISE_MAP_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={cn('overflow-hidden rounded-2xl bg-muted', compact ? 'h-64' : 'h-[clamp(18rem,55vw,28rem)]')}>
        {failed ? (
          <MapUnavailable />
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

/** A level's range with the colour of its middle, or «нет оценки». */
function Level({ range }: { range: LevelRange | null }) {
  if (!range) return <span className="text-muted-foreground">нет оценки</span>
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: noiseColor(dayColorLevel(range)) }}
        aria-hidden
      />
      {dayLabel(range)}
    </span>
  )
}

const PERIODS: { key: keyof SideLevels; icon: LucideIcon; label: string; note: string }[] = [
  { key: 'lday', icon: Sun, label: 'День', note: '07–19' },
  { key: 'levening', icon: Sunset, label: 'Вечер', note: '19–23' },
  { key: 'lnight', icon: Moon, label: 'Ночь', note: '23–07' },
]

function SideTiles({ title, side }: { title: string; side: SideLevels }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-semibold">{title}</h4>
      <ul className="grid grid-cols-3 gap-2">
        {PERIODS.map(({ key, icon: Icon, label, note }) => (
          <li key={key} className="flex flex-col gap-0.5 rounded-xl bg-secondary p-2.5">
            <span className="flex items-center gap-1.5 text-sm">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
            </span>
            <b>
              <Level range={side[key]} />
            </b>
            <span className="text-xs text-muted-foreground">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The estimate at the facade to the street and to the yard by period, the WHO line and the places' share. */
function LevelCard({ noise, estimate }: { noise: HotelNoiseData; estimate: NoiseEstimate }) {
  const night = loudestSource(noise, 'Lnight')
  const who = night && whoLine(night, 'Lnight')
  const venues = venuesLine(estimate.venues)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={card}>
      <h3 id={titleId} className="text-lg font-bold">
        Уровень шума у отеля
      </h3>
      <p className="text-sm text-muted-foreground">Оценка снаружи у стены здания, дБ.</p>
      <SideTiles title="Фасад на улицу" side={estimate.street} />
      <SideTiles title="Окна во двор" side={estimate.yard} />
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {night && (
          <li>
            Ночью у фасада по карте EEA: {bandLabel(night.lnight!)},{' '}
            {noiseSourceLabel(night.source).toLocaleLowerCase('ru')}
            {who && `; ${who}`}.
          </li>
        )}
        {venues && (
          <li>
            Заведения рядом ({countRu(estimate.counted.length, ['место', 'места', 'мест'])} в {NOISY_RADIUS_M} м) дают{' '}
            {venues}.
          </li>
        )}
      </ul>
    </section>
  )
}

/** The EEA layers at the facade and the loud places of OSM nearby. */
function SourcesCard({ noise }: { noise: HotelNoiseData }) {
  const places = noise.places.slice(0, PLACES_SHOWN)
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={card}>
      <h3 id={titleId} className="text-lg font-bold">
        Источники шума
      </h3>
      {noise.sources.length > 0 ? (
        <ul aria-label="Карты шума EEA у фасада" className="flex flex-col gap-2.5">
          {noise.sources.map((s) => {
            const Icon = SOURCE_ICON[s.source] ?? Car
            const yard = noise.yard.find((y) => y.source === s.source)
            const bands = (layer: SourceNoise) =>
              [layer.lden && `${bandLabel(layer.lden)} за сутки`, layer.lnight && `${bandLabel(layer.lnight)} ночью`]
                .filter(Boolean)
                .join(' · ')
            return (
              <li key={s.source} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-semibold">{noiseSourceLabel(s.source)}</span>
                  <span className="text-sm text-muted-foreground">На улицу: {bands(s)}</span>
                  {yard && bands(yard) !== bands(s) && (
                    <span className="text-sm text-muted-foreground">Во двор: {bands(yard)}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Карты шума EEA у здания отеля данных не дают.</p>
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
            ? 'Баров, клубов, ресторанов, кафе и остановок рядом по OpenStreetMap нет.'
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

/** The estimate at the facade, or «нет данных EEA», never «тихо». */
function NoiseLevel({ noise, estimate }: { noise: HotelNoiseData; estimate: NoiseEstimate | null }) {
  return estimate ? (
    <LevelCard noise={noise} estimate={estimate} />
  ) : (
    <p className={card}>{NO_EEA}. Это не значит, что здесь тихо.</p>
  )
}

const link = 'text-primary hover:underline'

/** How the estimate is computed, the sources last. */
function MethodCard({ className = 'md:col-span-2' }: { className?: string }) {
  return (
    <details className={cn(card, 'gap-2', className)}>
      <summary className="cursor-pointer font-semibold">Как мы считаем</summary>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        {NOISE_ESTIMATE_NOTES.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>
          Источники:{' '}
          <a href={EEA_NOISE_URL} target="_blank" rel="noopener" className={link}>
            Карты шума EEA
          </a>{' '}
          по директиве 2002/49/EC, раунд 2022: полосы Lden и Lnight;{' '}
          <a href="https://eubucco.com/data/download/v0.2" target="_blank" rel="noopener" className={link}>
            EUBUCCO v0.2
          </a>{' '}
          (контур здания отеля); места рядом —{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className={link}>
            © OpenStreetMap
          </a>
          ; рекомендации ВОЗ по шуму для Европейского региона, 2018.
        </li>
      </ul>
    </details>
  )
}

/**
 * «Шум и окружение» of a real hotel: the EEA contours around it on the map, the estimate of noise-estimate-v2 at the
 * facade to the street and to the yard, the sources (EEA's layers at the facade and OSM's loud places) and how it is
 * computed. A hotel outside EEA's maps says «нет данных EEA», never «тихо».
 */
export function HotelNoise({ hotel, noise }: { hotel: Hotel; noise: HotelNoiseData }) {
  const estimate = noiseEstimate(noise)
  return (
    <section id="noise" tabIndex={-1} aria-labelledby="noise-title" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-col gap-1">
        <h2 id="noise-title" className="text-heading font-bold">
          Шум и окружение
        </h2>
        <p className="text-muted-foreground">
          Оценка у фасада отеля по картам шума EEA и заведениям OpenStreetMap вокруг.
        </p>
      </div>
      <NoiseMapCard hotel={hotel} noise={noise} />
      <div className="grid gap-4 md:grid-cols-2">
        <NoiseLevel noise={noise} estimate={estimate} />
        <SourcesCard noise={noise} />
        <MethodCard />
      </div>
    </section>
  )
}

/**
 * «Шум и окружение» in Эвал's answer: the same map by day and by night, the estimate at the facade to the street and
 * to the yard, the sources and the method, one column for the chat. Without the map (no WebGL, no contours) the
 * estimate and the sources stay.
 */
export function NoiseAnswer({ widget }: { widget: NoiseWidget }) {
  const { hotel, noise } = widget
  const estimate = noiseEstimate(noise)
  return (
    <div className="flex flex-col gap-3">
      <NoiseMapCard hotel={hotel} noise={noise} compact />
      <NoiseLevel noise={noise} estimate={estimate} />
      <SourcesCard noise={noise} />
      <MethodCard className="" />
    </div>
  )
}
