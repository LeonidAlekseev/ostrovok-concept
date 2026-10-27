## 1. Карта отеля по видимой области

- [x] 1.1 `src/lib/mapBox.ts`: рамка вида с запасом, сеткой и пределом; разбор `?bbox=`
- [x] 1.2 `loadBoxHotels` и `GET /api/hotels?bbox=`; тестовый каталог
- [x] 1.3 `useHotels({ bbox })`, `SearchMap` (`frame`, `onViewChange`), `HotelMapDialog` (зум 15, пауза, накопление)

## 2. Атрибуция

- [x] 2.1 `manageAttribution` в `mapSetup.ts`; `SearchMap`, `PlacesMap`, `NoiseMap` на нём и на `ATTRIBUTION_CLASS`

## 3. Карта «Шум»

- [x] 3.1 Миграция `hotel_noise_quiet`, `db:push`, `db:types`; `noiseMapOf` с тихой зоной
- [x] 3.2 Плоская карта, зелёная тихая зона, точки-кнопки со всплывающим окном
- [x] 3.3 Легенда: «<40», группы точек; на телефоне над картой; без фразы об экранировании

## 4. Проверка

- [x] 4.1 Тесты `mapBox`, `/api/hotels`, `HotelMapDialog`, `NoiseMap`, `HotelNoise`, `db/noise`
- [x] 4.2 Браузер: десктоп 1280 и 375 px, снимки вне репозитория
