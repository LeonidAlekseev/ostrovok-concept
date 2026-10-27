## 1. Данные

- [x] 1.1 `src/lib/noise.ts`: полосы, дневной уровень по директиве, кривая суток, ВОЗ, `noiseLines`
- [x] 1.2 `src/lib/db/noise.ts`: `loadHotelNoise` (`hotel_geo` + `osm_places_near`), `loadNoiseMap` (`hotel_geo_features`)
- [x] 1.3 `GET /api/hotels/<id>/noise-map`
- [x] 1.4 `heightEstimated` у здания, ключ кэша деталей `hotel-details-v2`

## 2. Страница

- [x] 2.1 `HotelNoise` и `NoiseMap` (MapLibre, Tailwind, атрибуция EEA и OSM), вкладка «Шум»
- [x] 2.2 «Нет данных EEA» вместо «тихо», без графика для открытых полос
- [x] 2.3 Визуальная проверка на отелях Валенсии (десктоп и 390 px), снимки вне репозитория

## 3. Эвал

- [x] 3.1 Строки шума в фактах модели и правило «шумно ли» без модели

## 4. Проверка

- [x] 4.1 Тесты `noise`, `db/noise`, `HotelNoise`, `hotelAnswer`, `ota/page`; README
- [x] 4.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
