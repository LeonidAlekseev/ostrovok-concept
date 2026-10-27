import { describe, expect, it } from 'vitest'
import {
  asksSea,
  asksSunset,
  bearingDeg,
  bestVerdict,
  buildingLabel,
  curvatureDrop,
  elevationAngle,
  isViewQuestion,
  lineVerdict,
  localTime,
  nearestRay,
  observerLabel,
  observerOf,
  openestSide,
  pointAt,
  pointVerdict,
  RAY_BEARINGS,
  seaHorizonAngle,
  seaLineVerdict,
  seaPoints,
  seaVerdict,
  sideSummary,
  sunPosition,
  sunsetOf,
  sunsetRange,
  verdictReason,
  type SightLine,
  type ViewObserver,
  type ViewRay,
  type ViewTarget,
} from './view'

const valencia = { lat: 39.4735, lon: -0.3799 }

const line = (over: Partial<SightLine> = {}): SightLine => ({
  distanceM: 1000,
  checked: true,
  crossed: 3,
  maxAngle: -2,
  maxAngleUpper: -1.5,
  firstAboveM: null,
  coveredM: 1000,
  blocker: { id: 'b1', distanceM: 200, heightM: 30, estimated: true },
  targetBuilding: null,
  ...over,
})

const observer: ViewObserver = { floor: 12, floors: 12, heightM: 36, heightEstimated: true, eyeM: 34.5 }

// hotel-page, Requirement: Вид из отеля настоящего отеля
describe('the window', () => {
  it('stands on the chosen floor, the top one by default, at the storey of the height by the floors', () => {
    const building = { floors: 12, heightM: 36, estimated: false, heightEstimated: true }
    expect(observerOf(building)).toEqual({ floor: 12, floors: 12, heightM: 36, heightEstimated: true, eyeM: 34.5 })
    expect(observerOf(building, 1)?.eyeM).toBe(1.5)
    expect(observerOf(building, 4)?.eyeM).toBe(10.5)
    expect(observerOf(building, 40)?.floor).toBe(12)
  })

  it('is at the roof without the floors, and none without a height (no building or a doubtful one)', () => {
    expect(observerOf({ floors: null, heightM: 20, estimated: true })).toMatchObject({ floor: null, eyeM: 18.5 })
    expect(observerOf({ floors: 5, heightM: null, estimated: false })).toBeNull()
    expect(observerOf(null)).toBeNull()
  })

  it('is told with «≈» for an estimated height', () => {
    expect(observerLabel(observer)).toBe('окно 12-го этажа, ≈ 34,5 м над землёй')
    expect(buildingLabel(observer)).toBe('здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)')
    expect(buildingLabel({ ...observer, heightEstimated: false, floors: null })).toBe('здание 36 м')
  })
})

describe('the geometry', () => {
  it('lowers far points by the curvature with the refraction', () => {
    expect(curvatureDrop(5000)).toBeCloseTo(1.71, 2)
    expect(elevationAngle(34.5, 100, 34.5)).toBeCloseTo(0, 2)
    expect(elevationAngle(0, 5000, 34.5)).toBeCloseTo(-0.415, 2)
    expect(seaHorizonAngle(34.5)).toBeCloseTo(-0.176, 2)
  })

  it('measures bearings and points around the hotel', () => {
    expect(bearingDeg(valencia, { lat: valencia.lat, lon: valencia.lon + 0.01 })).toBeCloseTo(90, 0)
    const p = pointAt(valencia, 270, 1500)
    expect(bearingDeg(valencia, p)).toBeCloseTo(270, 0)
    expect(RAY_BEARINGS).toHaveLength(120)
    expect(
      nearestRay(
        RAY_BEARINGS.map((bearing) => ({ bearing })),
        359,
      )?.bearing,
    ).toBe(0)
  })
})

describe('the verdicts', () => {
  it('are three: seen, obstacles possible, not enough data', () => {
    expect(lineVerdict(line(), 0)).toBe('visible')
    expect(lineVerdict(line({ maxAngle: 1 }), 0)).toBe('obstructed')
    // Clear with EUBUCCO's height, not with the upper bound of its interval.
    expect(lineVerdict(line({ maxAngleUpper: 0.2 }), 0)).toBe('obstructed')
    // The dataset stops before the target: nothing is known past it.
    expect(lineVerdict(line({ coveredM: 600 }), 0)).toBe('unknown')
    // A building in the covered part blocks it whatever lies beyond.
    expect(lineVerdict(line({ coveredM: 600, maxAngle: 3 }), 0)).toBe('obstructed')
    expect(lineVerdict(line({ checked: false }), 0)).toBe('unknown')
    expect(lineVerdict(undefined, 0)).toBe('unknown')
  })

  it('see a place by the top of its building, else by the ground at its point', () => {
    expect(pointVerdict(line({ maxAngle: -3, maxAngleUpper: -2.5 }), 34.5)).toBe('visible')
    expect(pointVerdict(line({ maxAngle: -1.5, maxAngleUpper: -1 }), 34.5)).toBe('obstructed')
    expect(
      pointVerdict(
        line({ maxAngle: -1, maxAngleUpper: -0.5, targetBuilding: { id: 't', heightM: 60, estimated: true } }),
        34.5,
      ),
    ).toBe('visible')
  })

  it('see the sea over the buildings up to its horizon', () => {
    expect(seaLineVerdict(line({ maxAngle: -0.5, maxAngleUpper: -0.3 }), 34.5)).toBe('visible')
    expect(seaLineVerdict(line({ maxAngle: -0.1 }), 34.5)).toBe('obstructed')
    expect(bestVerdict(['unknown', 'obstructed'])).toBe('obstructed')
    expect(bestVerdict(['obstructed', 'visible'])).toBe('visible')
    expect(bestVerdict([])).toBe('unknown')
  })

  it('say why: the building in the way or the gap in the data', () => {
    expect(verdictReason(line({ maxAngle: 2 }), 'obstructed')).toBe(
      'мешает здание ≈ 30 м (по оценке EUBUCCO) в 200 м от отеля',
    )
    expect(verdictReason(line({ coveredM: 600 }), 'unknown')).toBe('данные о зданиях есть только на первые 600 м пути')
    expect(verdictReason(line({ checked: false }), 'unknown')).toBe('дальше 6 км — не проверяем')
  })
})

describe('the sea', () => {
  const target = (bearing: number, over: Partial<SightLine> = {}): ViewTarget => ({
    kind: 'sea',
    name: 'Берег моря',
    category: 'море',
    lat: 39.46,
    lon: -0.33,
    distanceM: 4400,
    bearing,
    line: line({ distanceM: 4400, coveredM: 4400, ...over }),
  })

  it('is seen when one of its points is, with that point', () => {
    const view = { observer, seaChecked: true, sea: [target(100, { maxAngle: 2 }), target(80)] }
    expect(seaVerdict(view)).toMatchObject({ verdict: 'visible', point: { bearing: 80 } })
    expect(seaVerdict(view, 's')).toMatchObject({ verdict: 'unknown', point: undefined })
    expect(seaVerdict({ ...view, seaChecked: false }).verdict).toBe('unknown')
  })

  it('is checked at the nearest points of different bearings', () => {
    const coast = [
      { lat: 39.46, lon: -0.331, distanceM: 4430 },
      { lat: 39.4601, lon: -0.3311, distanceM: 4431 },
      { lat: 39.4789, lon: -0.3232, distanceM: 4910 },
      { lat: 39.5, lon: -0.2, distanceM: 15000 },
    ]
    expect(seaPoints(valencia, coast).map((p) => p.distanceM)).toEqual([4430, 4910])
  })
})

describe('the sides', () => {
  const rays: ViewRay[] = RAY_BEARINGS.map((bearing) => ({
    bearing,
    line: line({
      distanceM: 1500,
      coveredM: 1500,
      ...(bearing >= 75 && bearing <= 105 ? {} : { maxAngle: 5, firstAboveM: 25 }),
    }),
  }))

  it('count the rays over the roofs and the nearest building above the window', () => {
    expect(sideSummary(rays, 'e')).toEqual({ rays: 15, open: 11, nearestAboveM: 25 })
    expect(sideSummary(rays, 'w')).toEqual({ rays: 15, open: 0, nearestAboveM: 25 })
    expect(openestSide(rays)).toBe('e')
  })
})

describe('the sun', () => {
  it('sets in Valencia where and when the almanacs say', () => {
    const summer = sunsetOf('2026-06-21', valencia.lat, valencia.lon)!
    expect(localTime(summer.at)).toBe('21:32')
    expect(summer.azimuth).toBeCloseTo(301.9, 0)
    expect(localTime(summer.checkAt)).toBe('21:15')
    const winter = sunsetOf('2026-12-21', valencia.lat, valencia.lon)!
    expect(localTime(winter.at)).toBe('17:41')
    expect(winter.azimuth).toBeCloseTo(239.9, 0)
    const range = sunsetRange(2026, valencia.lat, valencia.lon)!
    expect([Math.round(range.winter), Math.round(range.summer)]).toEqual([240, 302])
    expect(sunsetOf('не дата', valencia.lat, valencia.lon)).toBeNull()
  })

  it('stands at its height at noon', () => {
    expect(sunPosition(new Date('2026-06-21T12:00:00Z'), valencia.lat, valencia.lon).altitude).toBeCloseTo(73.9, 0)
  })
})

describe('the questions', () => {
  it('tell the view from the rest', () => {
    for (const text of [
      'Видно ли море из окна?',
      'Будет ли виден закат?',
      'Какой вид из номера?',
      'Увижу ли я Город искусств и наук?',
      'Видна ли больница с 5 этажа?',
    ])
      expect(isViewQuestion(text)).toBe(true)
    for (const text of ['Есть ли рядом бар?', 'Сколько идти до моря?', 'Есть ли парковка?', 'Видео есть?'])
      expect(isViewQuestion(text)).toBe(false)
    expect([asksSea('Видно ли море?'), asksSea('Видно ли Морской музей?')]).toEqual([true, true])
    expect(asksSea('Видно ли собор?')).toBe(false)
    expect(asksSunset('А закат видно?')).toBe(true)
  })
})
