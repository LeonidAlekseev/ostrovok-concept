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
  seaSeen,
  verdictText,
  windowLabel,
  windowOf,
  windowSideLabel,
  type LineBlocker,
  type SightLine,
  type ViewRay,
  type ViewTarget,
  type ViewWindow,
} from './view'

const valencia = { lat: 39.4735, lon: -0.3799 }

/** A building of 30 m, 24–36 m by EUBUCCO's interval, 200 m away: in the way of the eyes up to 14, 20 and 26 m. */
const blocker = (over: Partial<LineBlocker> = {}): LineBlocker => ({
  id: 'b1',
  distanceM: 200,
  heightM: 30,
  heightLowerM: 24,
  heightUpperM: 36,
  estimated: true,
  eyeLowerM: 14,
  eyeM: 20,
  eyeUpperM: 26,
  ...over,
})

/** A line clear from an eye above 26 m, in the way surely below 14 m, by EUBUCCO's height below 20 m. */
const line = (
  over: Partial<SightLine> = {},
  eye: { eyeM?: number | null; eyeLowerM?: number | null; eyeUpperM?: number | null } = {},
): SightLine => ({
  distanceM: 1000,
  checked: true,
  crossed: 3,
  coveredM: 1000,
  eyes: [{ eyeM: 20, eyeLowerM: 14, eyeUpperM: 26, blockers: [blocker()], ...eye }],
  targetBuilding: null,
  ...over,
})

/** No building on the line. */
const empty = { eyeM: null, eyeLowerM: null, eyeUpperM: null, blockers: [] }

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
  it('are as sure as the bounds of the heights', () => {
    expect(lineVerdict(line(), 30)).toBe('visible')
    // In the way even with the lower bound of the height: closed.
    expect(lineVerdict(line(), 10)).toBe('blocked')
    // With EUBUCCO's height, not with the lower bound.
    expect(lineVerdict(line(), 17)).toBe('likely')
    // With the upper bound only.
    expect(lineVerdict(line(), 24)).toBe('possible')
    // A measured height has no interval: in the way or not.
    const measured = line({}, { eyeM: 20, eyeLowerM: 20, eyeUpperM: 20 })
    expect([lineVerdict(measured, 19), lineVerdict(measured, 21)]).toEqual(['blocked', 'visible'])
  })

  it('see a line without buildings within the data: over the sea or a park too', () => {
    expect(lineVerdict(line({ crossed: 0 }, empty), 1.5)).toBe('visible')
  })

  it('know nothing only where the line leaves the data', () => {
    // A line into another municipality, nothing in the way before: no data.
    expect(lineVerdict(line({ coveredM: 600 }), 30)).toBe('unknown')
    expect(lineVerdict(line({ coveredM: 600, crossed: 0 }, empty), 30)).toBe('unknown')
    // A building in the way before closes it whatever lies beyond; the upper bound alone does not.
    expect(lineVerdict(line({ coveredM: 600 }), 10)).toBe('blocked')
    expect(lineVerdict(line({ coveredM: 600 }), 17)).toBe('likely')
    expect(lineVerdict(line({ coveredM: 600 }), 24)).toBe('unknown')
    expect(lineVerdict(line({ coveredM: null }), 30)).toBe('unknown')
    expect(lineVerdict(line({ checked: false }), 30)).toBe('unknown')
    expect(lineVerdict(undefined, 30)).toBe('unknown')
  })

  it('see the sun in part when the roofs hide it below 2°', () => {
    // The ray's roofs (0°) are in the way below 40 m, the sun (2°) below 10 m.
    const ray = line({}, {})
    ray.eyes = [
      { eyeM: 40, eyeLowerM: 35, eyeUpperM: 45, blockers: [blocker({ distanceM: 900, eyeLowerM: 35, eyeM: 40 })] },
      { eyeM: 8, eyeLowerM: 6, eyeUpperM: 10, blockers: [blocker({ distanceM: 900, eyeLowerM: 6, eyeM: 8 })] },
    ]
    expect(lineVerdict(ray, 20, 1)).toBe('partial')
    expect(lineVerdict(ray, 50, 1)).toBe('visible')
    expect(lineVerdict(ray, 5, 1)).toBe('blocked')
    // Not at the roofs' angle itself.
    expect(lineVerdict(ray, 20, 0)).toBe('blocked')
    expect(verdictText(ray, 20, 1)).toBe(
      'частично закрыто: солнце на высоте 2° видно, ниже его закрывает здание ≈ 30 м (по оценке EUBUCCO) в 900 м от отеля',
    )
  })

  it('tell from which floor the line is seen', () => {
    // The eye of the 10th floor is 28,5 m, of the 9th 25,5 m: under 26 m.
    expect(reachOf(line(), window12)).toEqual({ kind: 'from', floor: 10 })
    expect(reachOf(line({}, { eyeM: -3, eyeLowerM: -5, eyeUpperM: 0 }), window12)).toEqual({ kind: 'all' })
    expect(reachOf(line({ crossed: 0 }, empty), window12)).toEqual({ kind: 'all' })
    expect(reachOf(line({}, { eyeM: 40, eyeLowerM: 38, eyeUpperM: 45 }), window12)).toEqual({ kind: 'none' })
    // The top floor's eye, 34,5 m, is above EUBUCCO's height but not its upper bound: perhaps, from the 8th (22,5 m).
    expect(reachOf(line({}, { eyeM: 22, eyeLowerM: 18, eyeUpperM: 40 }), window12)).toEqual({ kind: 'maybe', floor: 8 })
    expect(reachOf(line({ coveredM: 600 }), window12)).toEqual({ kind: 'unknown' })
    expect(reachOf(null, window12)).toEqual({ kind: 'unknown' })
    expect(
      [
        { kind: 'from', floor: 10 },
        { kind: 'all' },
        { kind: 'none' },
        { kind: 'from', floor: 2 },
        { kind: 'maybe', floor: 8 },
        { kind: 'maybe', floor: 1 },
      ].map((r) => reachLabel(r as never)),
    ).toEqual([
      'видно с 10-го этажа',
      'видно со всех этажей',
      'не видно ни с одного этажа',
      'видно со 2-го этажа',
      'возможно, видно с 8-го этажа',
      'возможно, видно со всех этажей',
    ])
    expect(reachLabel({ kind: 'unknown' })).toBe('нет данных')
    expect(bestReach([{ kind: 'unknown' }, { kind: 'none' }])).toEqual({ kind: 'none' })
    expect(
      bestReach([
        { kind: 'maybe', floor: 1 },
        { kind: 'from', floor: 12 },
      ]),
    ).toEqual({ kind: 'from', floor: 12 })
    expect(
      bestReach([
        { kind: 'from', floor: 5 },
        { kind: 'from', floor: 3 },
      ]),
    ).toEqual({ kind: 'from', floor: 3 })
  })

  it('say why, as surely as the data: the building in the way or where the data end', () => {
    // hotel-page, Scenario: Близкое препятствие
    const near = line({}, { eyeM: 15.5, eyeLowerM: 12.5, eyeUpperM: 18.5 })
    near.eyes[0].blockers = [
      blocker({
        distanceM: 77.3,
        heightM: 17.2,
        heightLowerM: 14.2,
        heightUpperM: 20.2,
        eyeLowerM: 12.5,
        eyeM: 15.5,
        eyeUpperM: 18.5,
      }),
    ]
    expect(verdictText(near, 4.5)).toBe('закрыто зданием ≈ 17,2 м (по оценке EUBUCCO) в 80 м от отеля')
    expect(verdictText(line(), 17)).toBe(
      'вероятно, закрыто зданием ≈ 30 м (по оценке EUBUCCO: от 24 до 36 м) в 200 м от отеля',
    )
    expect(verdictText(line(), 24)).toBe(
      'возможно, закрыто: здание ≈ 30 м (по оценке EUBUCCO) в 200 м от отеля может быть выше — до 36 м',
    )
    expect(verdictText(line({ crossed: 0 }, empty), 1.5)).toBe('видно')
    expect(verdictText(line({ coveredM: 600 }), 30)).toBe(
      'нет данных: через 600 м линия уходит за границу муниципалитета Валенсия — данных о зданиях там нет',
    )
    expect(verdictText(line({ coveredM: 0 }), 30)).toBe(
      'нет данных: отель за границей муниципалитета Валенсия — данных о зданиях вокруг нет',
    )
    expect(verdictText(line({ checked: false }), 30)).toBe('нет данных: дальше 6 км — не проверяем')
  })

  it('colour the buildings in the way of the eye, the surest first', () => {
    const two = line({}, {
      blockers: [
        blocker({ id: 'a', eyeLowerM: 5, eyeM: 10, eyeUpperM: 30 }),
        blocker({ id: 'b', eyeLowerM: 18, eyeM: 22, eyeUpperM: 25 }),
      ],
    } as never)
    // Both surely in the way of 4 m: the one rising more by its lower bound first.
    expect(blockersAt(two, 4).map((b) => b.id)).toEqual(['b', 'a'])
    // b surely, a by its upper bound only.
    expect(blockersAt(two, 15).map((b) => b.id)).toEqual(['b', 'a'])
    expect(blockersAt(two, 24).map((b) => b.id)).toEqual(['a', 'b'])
    expect(blockersAt(two, 31)).toEqual([])
  })

  it('name the window by its floor and side', () => {
    expect(windowSideLabel('se', 2)).toBe('Окно на 2-м этаже на юго-восток')
    expect(windowSideLabel('n', 12)).toBe('Окно на 12-м этаже на север')
    expect(windowSideLabel('w', null)).toBe('Окно на запад')
  })
})

describe('the sea', () => {
  const target = (bearing: number, eye: { eyeM: number; eyeLowerM?: number; eyeUpperM: number }): ViewTarget => ({
    kind: 'sea',
    name: 'Берег моря',
    category: 'море',
    lat: 39.46,
    lon: -0.33,
    distanceM: 4400,
    bearing,
    line: line({ distanceM: 4400, coveredM: 4400 }, { eyeLowerM: eye.eyeM - 2, ...eye }),
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
    expect(seaSeen(view, 10.5)).toEqual({ seen: 1, of: 2 })
    expect(seaSeen(view, 34.5)).toEqual({ seen: 2, of: 2 })
  })

  // hotel-page, Scenario: Море без препятствий
  it('is seen with no building to the coast, the coast within the data', () => {
    const open = {
      ...target(110, { eyeM: 0, eyeUpperM: 0 }),
      line: line({ distanceM: 770, coveredM: 770, crossed: 0 }, empty),
    }
    expect(seaReach({ window: window12, seaChecked: true, sea: [open] }).reach).toEqual({ kind: 'all' })
    expect(verdictText(open.line, 1.5)).toBe('видно')
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
        { eyeM: roofs - 2, eyeLowerM: roofs - 4, eyeUpperM: roofs, blockers: [] },
        { eyeM: sun - 2, eyeLowerM: sun - 4, eyeUpperM: sun, blockers: [] },
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
