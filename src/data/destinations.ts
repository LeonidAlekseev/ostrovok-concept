export type ScenarioId = 'sea' | 'weekend' | 'europe'

export interface Destination {
  id: string
  name: string
  country: string
  lat: number
  lon: number
  /** Minimal demo price per night, ₽. */
  priceFrom: number
  scenarios: ScenarioId[]
  /** Show a marker for the destination on the hero globe. */
  onGlobe?: boolean
}

export interface Scenario {
  id: ScenarioId
  title: string
  image: string
  alt: string
}

export const destinations: Destination[] = [
  {
    id: 'prague',
    name: 'Прага',
    country: 'Чехия',
    lat: 50.08,
    lon: 14.43,
    priceFrom: 6900,
    scenarios: ['weekend', 'europe'],
    onGlobe: true,
  },
  {
    id: 'paris',
    name: 'Париж',
    country: 'Франция',
    lat: 48.86,
    lon: 2.35,
    priceFrom: 9800,
    scenarios: ['weekend', 'europe'],
  },
  {
    id: 'london',
    name: 'Лондон',
    country: 'Великобритания',
    lat: 51.51,
    lon: -0.13,
    priceFrom: 12500,
    scenarios: ['europe'],
    onGlobe: true,
  },
  {
    id: 'oslo',
    name: 'Осло',
    country: 'Норвегия',
    lat: 59.91,
    lon: 10.75,
    priceFrom: 10400,
    scenarios: ['europe'],
    onGlobe: true,
  },
  {
    id: 'stockholm',
    name: 'Стокгольм',
    country: 'Швеция',
    lat: 59.33,
    lon: 18.07,
    priceFrom: 9100,
    scenarios: ['europe'],
  },
  {
    id: 'helsinki',
    name: 'Хельсинки',
    country: 'Финляндия',
    lat: 60.17,
    lon: 24.94,
    priceFrom: 8700,
    scenarios: ['europe'],
    onGlobe: true,
  },
  {
    id: 'florence',
    name: 'Флоренция',
    country: 'Италия',
    lat: 43.77,
    lon: 11.25,
    priceFrom: 7600,
    scenarios: ['weekend', 'europe'],
  },
  {
    id: 'rome',
    name: 'Рим',
    country: 'Италия',
    lat: 41.9,
    lon: 12.5,
    priceFrom: 8200,
    scenarios: ['weekend', 'europe'],
    onGlobe: true,
  },
  {
    id: 'madrid',
    name: 'Мадрид',
    country: 'Испания',
    lat: 40.42,
    lon: -3.7,
    priceFrom: 7900,
    scenarios: ['europe'],
    onGlobe: true,
  },
  {
    id: 'barcelona',
    name: 'Барселона',
    country: 'Испания',
    lat: 41.39,
    lon: 2.17,
    priceFrom: 8900,
    scenarios: ['sea', 'europe'],
  },
  {
    id: 'lisbon',
    name: 'Лиссабон',
    country: 'Португалия',
    lat: 38.72,
    lon: -9.14,
    priceFrom: 7400,
    scenarios: ['sea', 'europe'],
    onGlobe: true,
  },
  {
    id: 'athens',
    name: 'Афины',
    country: 'Греция',
    lat: 37.98,
    lon: 23.73,
    priceFrom: 6800,
    scenarios: ['sea', 'europe'],
  },
  { id: 'zakynthos', name: 'Закинф', country: 'Греция', lat: 37.78, lon: 20.9, priceFrom: 5900, scenarios: ['sea'] },
  {
    id: 'istanbul',
    name: 'Стамбул',
    country: 'Турция',
    lat: 41.01,
    lon: 28.98,
    priceFrom: 5200,
    scenarios: ['weekend'],
    onGlobe: true,
  },
  { id: 'antalya', name: 'Анталья', country: 'Турция', lat: 36.9, lon: 30.7, priceFrom: 4800, scenarios: ['sea'] },
  {
    id: 'sochi',
    name: 'Сочи',
    country: 'Россия',
    lat: 43.6,
    lon: 39.73,
    priceFrom: 5600,
    scenarios: ['sea', 'weekend'],
  },
  {
    id: 'kaliningrad',
    name: 'Калининград',
    country: 'Россия',
    lat: 54.71,
    lon: 20.51,
    priceFrom: 4200,
    scenarios: ['weekend'],
  },
  {
    id: 'tbilisi',
    name: 'Тбилиси',
    country: 'Грузия',
    lat: 41.72,
    lon: 44.79,
    priceFrom: 3900,
    scenarios: ['weekend'],
    onGlobe: true,
  },
]

export const FEATURED_DESTINATION_ID = 'prague'

export const scenarios: Scenario[] = [
  { id: 'sea', title: 'У моря', image: '/images/sea-navagio.webp', alt: 'Бирюзовая бухта Навагио на острове Закинф' },
  {
    id: 'weekend',
    title: 'На выходные',
    image: '/images/florence-duomo.webp',
    alt: 'Исторический центр Флоренции с собором Санта-Мария-дель-Фьоре',
  },
  { id: 'europe', title: 'Города Европы', image: '/images/paris-eiffel.webp', alt: 'Эйфелева башня на закате' },
]
