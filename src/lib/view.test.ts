import { describe, expect, it } from 'vitest'
import {
  asksSea,
  asksSunrise,
  asksSunset,
  bearingDeg,
  bestReach,
  blockersAt,
  curvatureDrop,
  eyeOf,
  floorLabel,
  isViewQuestion,
  lineVerdict,
  localTime,
  nearestRay,
  openestSide,
  pointAt,
  RAY_BEARINGS,
  reachLabel,
  reachOf,
  seaPoints,
  seaReach,
  sideSummary,
  sunPosition,
  sunReach,
  sunriseOf,
  sunriseRange,
  sunsetOf,
  sunsetRange,
  verdictReason,
  windowLabel,
  windowOf,
  type LineBlocker,
  type SightLine,
  type ViewRay,
  type ViewTarget,
  type ViewWindow,
} from './view'

const valencia = { lat: 39.4735, lon: -0.3799 }

const blocker = (over: Partial<LineBlocker> = {}): LineBlocker => ({
  id: 'b1',
  distanceM: 200,
  heightM: 30,
  estimated: true,
  eyeM: 20,
  eyeUpperM: 26,
  ...over,
})

/** A line clear from an eye above 26 m, with EUBUCCO's height above 20 m. */
const line = (
  over: Partial<SightLine> = {},
  eye: { eyeM?: number | null; eyeUpperM?: number | null } = {},
): SightLine => ({
  distanceM: 1000,
  checked: true,
  crossed: 3,
  coveredM: 1000,
  eyes: [{ eyeM: 20, eyeUpperM: 26, blockers: [blocker()], ...eye }],
  targetBuilding: null,
  ...over,
})

/** 12 floors of 3 m: the eyes at 1,5, 4,5, …, 34,5 m. */
const window12: ViewWindow = { source: 'building', floors: 12, storeyM: 3, heightM: 36, estimated: true }

// hotel-page, Requirement: Этаж и сторона окна
describe('the window', () => {
  it('has the floors of EUBUCCO’s building at the storey of its height by its floors', () => {
    const building = { floors: 12, heightM: 36, estimated: false, heightEstimated: true }
    expect(windowOf(building, 6)).toEqual(window12)
    expect(eyeOf(window12, 1)).toBe(1.5)
    expect(eyeOf(window12, 4)).toBe(10.5)
    expect(eyeOf(window12, 40)).toBe(34.5)
  })

  it('takes the floors the rooms take at a typical storey without exact data of the building, else none', () => {
    expect(windowOf(null, 10)).toEqual({ source: 'rooms', floors: 10, storeyM: 3, heightM: null, estimated: true })
    expect(windowOf({ floors: null, heightM: 20, estimated: true }, 4)).toMatchObject({ source: 'rooms', floors: 4 })
    expect(windowOf(null, null)).toBeNull()
    expect(windowOf(null, 0)).toBeNull()
  })

  it('is told with «≈» for an estimate, never comparing the rooms with the building', () => {
    expect(floorLabel(window12, 12)).toBe('окно 12-го этажа, ≈ 34,5 м над землёй')
    expect(windowLabel(window12)).toBe('здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)')
    expect(windowLabel({ ...window12, estimated: false })).toBe('здание 12 этажей, 36 м')
    const rooms = windowOf(null, 6)!
    expect(windowLabel(rooms)).toBe('нет точных данных о здании, номера на 6 этажах (Островок)')
    expect(floorLabel(rooms, 2)).toBe('окно 2-го этажа, ≈ 4,5 м над землёй')
  })
})

describe('the geometry', () => {
  it('lowers far points by the curvature with the refraction', () => {
    expect(curvatureDrop(5000)).toBeCloseTo(1.71, 2)
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
  it('are three from an eye: seen, obstacles possible, no data', () => {
    expect(lineVerdict(line(), 30)).toBe('visible')
    expect(lineVerdict(line(), 20)).toBe('obstructed')
    // Clear with EUBUCCO's height, not with the upper bound of its interval.
    expect(lineVerdict(line(), 24)).toBe('obstructed')
    // The dataset stops before the target: nothing is known past it.
    expect(lineVerdict(line({ coveredM: 600 }), 30)).toBe('unknown')
    // A building in the covered part blocks it whatever lies beyond.
    expect(lineVerdict(line({ coveredM: 600 }), 10)).toBe('obstructed')
    // No building on the line: seen from the ground.
    expect(lineVerdict(line({}, { eyeM: null, eyeUpperM: null }), 1.5)).toBe('visible')
    expect(lineVerdict(line({ checked: false }), 30)).toBe('unknown')
    expect(lineVerdict(undefined, 30)).toBe('unknown')
  })

  it('tell from which floor the line is seen', () => {
    // The eye of the 10th floor is 28,5 m, of the 9th 25,5 m: under 26 m.
    expect(reachOf(line(), window12)).toEqual({ kind: 'from', floor: 10 })
    expect(reachOf(line({}, { eyeM: -3, eyeUpperM: 0 }), window12)).toEqual({ kind: 'all' })
    expect(reachOf(line({}, { eyeM: 40, eyeUpperM: 45 }), window12)).toEqual({ kind: 'none' })
    expect(reachOf(line({ coveredM: 600 }), window12)).toEqual({ kind: 'unknown' })
    expect(reachOf(null, window12)).toEqual({ kind: 'unknown' })
    expect(
      [{ kind: 'from', floor: 10 }, { kind: 'all' }, { kind: 'none' }, { kind: 'from', floor: 2 }].map((r) =>
        reachLabel(r as never),
      ),
    ).toEqual(['видно с 10-го этажа', 'видно со всех этажей', 'не видно ни с одного этажа', 'видно со 2-го этажа'])
    expect(reachLabel({ kind: 'unknown' })).toBe('нет данных')
    expect(bestReach([{ kind: 'unknown' }, { kind: 'none' }])).toEqual({ kind: 'none' })
    expect(
      bestReach([
        { kind: 'from', floor: 5 },
        { kind: 'from', floor: 3 },
      ]),
    ).toEqual({ kind: 'from', floor: 3 })
  })

  it('say why: the building in the way of the eye or the gap in the data', () => {
    expect(verdictReason(line(), 'obstructed', 10)).toBe('мешает здание ≈ 30 м (по оценке EUBUCCO) в 200 м от отеля')
    expect(verdictReason(line({ coveredM: 600 }), 'unknown', 30)).toBe(
      'данные о зданиях есть только на первые 600 м пути',
    )
    expect(verdictReason(line({ checked: false }), 'unknown', 30)).toBe('дальше 6 км — не проверяем')
  })

  it('colour the buildings in the way of the eye, by EUBUCCO’s height first', () => {
    const two = line({}, {
      blockers: [blocker({ id: 'a', eyeM: 10, eyeUpperM: 30 }), blocker({ id: 'b', eyeM: 22, eyeUpperM: 25 })],
    } as never)
    expect(blockersAt(two, 15).map((b) => b.id)).toEqual(['b', 'a'])
    expect(blockersAt(two, 24).map((b) => b.id)).toEqual(['a', 'b'])
    expect(blockersAt(two, 31)).toEqual([])
  })
})

describe('the sea', () => {
  const target = (bearing: number, eye: { eyeM: number; eyeUpperM: number }): ViewTarget => ({
    kind: 'sea',
    name: 'Берег моря',
    category: 'море',
    lat: 39.46,
    lon: -0.33,
    distanceM: 4400,
    bearing,
    line: line({ distanceM: 4400, coveredM: 4400 }, eye),
  })

  it('is seen from the lowest floor of its points, with that point', () => {
    const view = {
      window: window12,
      seaChecked: true,
      sea: [target(100, { eyeM: 30, eyeUpperM: 33 }), target(80, { eyeM: 5, eyeUpperM: 8 })],
    }
    expect(seaReach(view)).toMatchObject({ reach: { kind: 'from', floor: 4 }, point: { bearing: 80 } })
    expect(seaReach(view, 's')).toMatchObject({ reach: { kind: 'unknown' }, point: undefined })
    expect(seaReach({ ...view, seaChecked: false }).reach).toEqual({ kind: 'unknown' })
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
  const ray = (bearing: number, roofs: number, sun: number): ViewRay => ({
    bearing,
    line: {
      ...line({ distanceM: 1500, coveredM: 1500 }),
      eyes: [
        { eyeM: roofs - 2, eyeUpperM: roofs, blockers: [] },
        { eyeM: sun - 2, eyeUpperM: sun, blockers: [] },
      ],
    },
  })
  const rays = RAY_BEARINGS.map((bearing) =>
    bearing >= 75 && bearing <= 105 ? ray(bearing, 10, 4) : ray(bearing, 50, 40),
  )

  it('count the rays over the roofs from the eye', () => {
    expect(sideSummary(rays, 'e', 34.5)).toEqual({ rays: 15, open: 11 })
    expect(sideSummary(rays, 'e', 4.5)).toEqual({ rays: 15, open: 0 })
    expect(sideSummary(rays, 'w', 34.5)).toEqual({ rays: 15, open: 0 })
    expect(openestSide(rays, 34.5)).toBe('e')
  })

  it('see the sun at 2° on its ray', () => {
    expect(sunReach({ rays, window: window12 }, 90).reach).toEqual({ kind: 'from', floor: 2 })
    expect(sunReach({ rays, window: window12 }, 270).reach).toEqual({ kind: 'none' })
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

  it('rises in Valencia where and when the almanacs say', () => {
    const summer = sunriseOf('2026-06-21', valencia.lat, valencia.lon)!
    // The almanacs: 06:36; the first minute the sun is up is told.
    expect(localTime(summer.at)).toBe('06:35')
    expect(summer.azimuth).toBeCloseTo(58, 0)
    expect(summer.checkAt > summer.at).toBe(true)
    const range = sunriseRange(2026, valencia.lat, valencia.lon)!
    expect([Math.round(range.summer), Math.round(range.winter)]).toEqual([58, 120])
    expect(sunriseOf('не дата', valencia.lat, valencia.lon)).toBeNull()
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
    expect([isViewQuestion('Увижу ли рассвет?'), asksSunrise('Увижу ли рассвет?'), asksSunrise('А закат?')]).toEqual([
      true,
      true,
      false,
    ])
  })
})
