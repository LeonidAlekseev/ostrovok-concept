import type { Route } from '../lib/routes'
import generatedRoutes from './generatedRoutes.json' with { type: 'json' }

/**
 * The routes `npm run db:seed` loads into the `routes` table: the hand-written one, then the routes of
 * `npm run routes:generate` (src/data/generatedRoutes.json, read and committed, not made in the build).
 * The site reads every route from the database (src/lib/db/routes.ts).
 */
const handWritten: Route[] = [
  {
    id: 'prague-culture',
    persona: 'culture',
    destinationId: 'prague',
    title: 'Культурный отпуск в Праге',
    author: { kind: 'editor' },
    description:
      'Пять ночей между Малой Страной и Новым городом: Пражский Град, органный концерт в соборе, ' +
      'Вышеград на закате и пивоварня с дегустацией. Сначала тихая резиденция под Градом, потом лофт у Влтавы.',
    cover: { id: 'prague-culture-cover', caption: 'Карлов мост и Пражский Град', tone: 2 },
    arrival: { name: 'Аэропорт Вацлава Гавела', lat: 50.1008, lon: 14.26, time: '12:30' },
    departure: { name: 'Главный вокзал Праги', lat: 50.0831, lon: 14.4353, time: '17:40' },
    stops: [
      { hotelId: 'prague-mala-strana-residence', nights: 3 },
      { hotelId: 'prague-vltava-loft-rooms', nights: 2 },
    ],
    transfers: ['transfer', 'taxi', 'taxi'],
    leisure: [
      {
        title: 'Пражский Град и собор Святого Вита',
        category: 'Экскурсия',
        day: 2,
        time: '10:00',
        minutes: 180,
        price: 2400,
      },
      {
        title: 'Органный концерт в соборе Святого Николая',
        category: 'Концерт',
        day: 2,
        time: '19:00',
        minutes: 90,
        price: 1800,
      },
      {
        title: 'Музей Альфонса Мухи',
        category: 'Музей',
        day: 3,
        time: '11:00',
        minutes: 90,
        price: 900,
      },
      {
        title: 'Вышеград на закате',
        category: 'Прогулка',
        day: 4,
        time: '18:00',
        minutes: 120,
        price: 0,
      },
      {
        title: 'Дегустация в пивоварне У Флеку',
        category: 'Гастрономия',
        day: 5,
        time: '19:30',
        minutes: 120,
        price: 2600,
      },
    ],
  },
]

export const seedRoutes: Route[] = [...handWritten, ...(generatedRoutes as Route[])]
