import { useMemo } from 'react'
import type { Hotel } from '@/lib/catalog'
import type { ViewFocus, ViewPlace } from '@/lib/chatWidget'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import {
  blockersAt,
  eyeOf,
  inSide,
  lineVerdict,
  openestSide,
  seaReach,
  seaSeen,
  sideAt,
  sideSummary,
  sunBlockers,
  sunReach,
  sunriseOf,
  sunsetOf,
  targetReach,
  VERDICT_LABEL,
  VERDICT_TONE,
  type HotelView as HotelViewData,
  type SideId,
  type ViewWindow,
} from '@/lib/view'
import { useHotelJson } from './useHotelJson'
import type { MapTarget } from './ViewMap'

/** The hotel of a map of the view: its id for the routes and its point. */
export type SceneHotel = Pick<Hotel, 'id' | 'lat' | 'lon'>

/**
 * What the map and the lists of the view show from a floor: the hotel's data of the page (`GET …/view`, the buildings
 * of `…/view-map`), the floor (the top one by default), the side (picked; else the side of `focus` — the sunset's, the
 * sunrise's, the coast's —, else the openest from the top floor), the sun of `date`, the dots and the lines of the map
 * and the buildings in the way. The page knows the window before the data; the chat's widget takes the data's. The
 * `places` of the chat's answer are dots with their lines besides the page's.
 */
export function useViewScene(
  hotel: SceneHotel,
  {
    window: known,
    enabled,
    floor: picked,
    date,
    side,
    focus,
    places = NO_PLACES,
  }: {
    window: ViewWindow | null
    enabled: boolean
    floor: number | null
    date: string
    side: SideId | null
    focus?: ViewFocus
    places?: readonly ViewPlace[]
  },
) {
  // The view from every floor, asked only when the floors of the window may be known.
  const { value: view, loading } = useHotelJson<HotelViewData>(hotel.id, 'view', 'view', enabled)
  // The buildings around the hotel for the map.
  const { value: buildings } = useHotelJson<ViewMapData>(hotel.id, 'view-map', 'map')
  const viewWindow = known ?? view?.window ?? null
  const floor = viewWindow ? Math.min(picked ?? viewWindow.floors, viewWindow.floors) : null
  const eyeM = viewWindow && floor ? eyeOf(viewWindow, floor) : 0
  const ready = view && !loading && floor ? view : null
  const sunset = date ? sunsetOf(date, hotel.lat, hotel.lon) : null
  const sunrise = date ? sunriseOf(date, hotel.lat, hotel.lon) : null
  const sea = ready ? seaReach(ready) : null
  const focusBearing =
    focus === 'sunset' ? sunset?.azimuth : focus === 'sunrise' ? sunrise?.azimuth : focus && sea?.point?.bearing
  // The side the page opens on is the openest from the top floor: it does not jump with the slider.
  const shownSide =
    side ??
    (ready
      ? focusBearing !== undefined
        ? sideAt(focusBearing)
        : openestSide(ready.rays, eyeOf(ready.window, ready.window.floors))
      : 'w')
  const sunsetSun = ready && sunset ? sunReach(ready, sunset.checkAzimuth) : null
  const sunriseSun = ready && sunrise ? sunReach(ready, sunrise.checkAzimuth) : null
  const seaShown = ready ? seaSeen(ready, eyeM) : null
  const sideSea = ready ? seaReach(ready, shownSide) : null
  const landmarks = useMemo(
    () => (ready ? ready.landmarks.map((target) => ({ target, reach: targetReach(target, ready.window) })) : []),
    [ready],
  )
  const inView = landmarks.filter(({ target }) => inSide(target.bearing, shownSide))
  const summary = ready ? sideSummary(ready.rays, shownSide, eyeM) : null
  // A dot for the sea and every landmark of the list, on any side; the line only for the ones of the shown side.
  const sidePoint = sideSea?.point
  const dots = [
    ...new Set([
      ...(sea?.point ? [sea.point] : []),
      ...(sidePoint ? [sidePoint] : []),
      ...landmarks.map((l) => l.target),
    ]),
  ]
  const mapTargets: MapTarget[] = [
    ...dots.map((t) => {
      const verdict = lineVerdict(t.line, eyeM)
      return {
        name: t.name,
        category: t.category,
        lat: t.lat,
        lon: t.lon,
        distanceM: t.distanceM,
        tone: VERDICT_TONE[verdict],
        verdict: VERDICT_LABEL[verdict],
        line: t === sidePoint || inView.some(({ target }) => target === t),
      }
    }),
    ...places
      .filter((p) => !dots.some((t) => t.name === p.name && t.lat === p.lat && t.lon === p.lon))
      .map((p) => ({
        name: p.name,
        category: p.category,
        lat: p.lat,
        lon: p.lon,
        distanceM: p.distanceM,
        tone: p.tone,
        verdict: p.verdict,
        line: true,
      })),
  ]
  const blockers = [
    ...sunBlockers(sunsetSun?.ray, eyeM),
    ...sunBlockers(sunriseSun?.ray, eyeM),
    ...(sideSea?.point ? blockersAt(sideSea.point.line, eyeM) : []),
    ...inView.flatMap(({ target }) => blockersAt(target.line, eyeM)),
  ]
    .map((b) => b.id)
    .concat(places.flatMap((p) => p.blockers))
  return {
    view,
    loading,
    buildings,
    viewWindow,
    floor,
    eyeM,
    ready,
    shownSide,
    sunset,
    sunrise,
    sunsetSun,
    sunriseSun,
    sea,
    seaShown,
    landmarks,
    summary,
    mapTargets,
    blockers,
  }
}
export type ViewScene = ReturnType<typeof useViewScene>

const NO_PLACES: readonly ViewPlace[] = []
