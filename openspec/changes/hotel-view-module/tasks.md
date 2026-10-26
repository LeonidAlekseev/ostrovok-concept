## 1. Данные

- [x] 1.1 Миграция `hotel_view_lines` (security definer, `search_path = ''`, права как у `hotel_geo_features`), проверка времени под anon
- [x] 1.2 `src/lib/view.ts`: окно, углы, кривизна, три итога, море, стороны, солнце, допущения, `RoomWindowSide`
- [x] 1.3 `src/lib/db/view.ts`: `loadHotelView`, `checkViewPoints`, `loadViewMap`; `GET /api/hotels/<id>/view`, `/view-map`

## 2. Страница

- [x] 2.1 `HotelView` и `ViewMap` (MapLibre, fill-extrusion EUBUCCO, сектор, закат; Tailwind), вкладка «Вид»
- [x] 2.2 «Недостаточно данных» без надёжной высоты здания
- [x] 2.3 Визуальная проверка на отелях Валенсии (десктоп и 390 px), снимки вне репозитория

## 3. Эвал

- [x] 3.1 `viewTurn`: море, закат, вид места (Островок, `nearbyPlaces`, `geocode`), этаж из вопроса
- [x] 3.2 `isHotelViewQuestion` отдельно от гео- и шумовых вопросов, шаг ожидания в чате

## 4. Проверка

- [x] 4.1 Тесты `view`, `db/view`, `viewTurn`, `HotelView`; README
- [x] 4.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`; `db:push`
