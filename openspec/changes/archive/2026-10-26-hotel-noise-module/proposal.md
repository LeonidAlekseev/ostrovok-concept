## Why

На странице настоящего отеля Валенсии нет ответа на частый вопрос «шумно ли здесь», хотя данные уже есть в базе: контуры шума EEA END 2022 (`geo_noise`, полосы 5 дБ Lden и Lnight по источникам), здания EUBUCCO и места OpenStreetMap (`osm_places`). Нужен модуль «Шум и окружение» по референсу `Источники шума.PNG` — только из реальных данных, без выдуманных оценок, и тот же ответ у Эвала.

## What Changes

- Раздел «Шум и окружение» и вкладка «Шум» на странице настоящего отеля: карта MapLibre с контурами EEA (Lden/Lnight) и шумными местами OSM, полосы Lden и Lnight в точке отеля по источникам с подписью EEA, дневной уровень из Lden и Lnight по формуле директивы 2002/49/EC, график суток (плавная интерполяция, подпись о точности), источники шума (слои EEA + бары, клубы, рестораны, трамвай, ж/д OSM в 200 м с расстоянием), здание EUBUCCO (≈ для оценки модели), источники данных.
- Отель вне карт EEA — «нет данных EEA», не «тихо». Сомнительное здание (правило `isDoubtfulBuilding`) не показывается.
- `GET /api/hotels/<id>/noise-map` — контуры шума вокруг отеля (GeoJSON без зданий).
- Эвал в чате отеля получает те же строки (`noiseLines`); без модели отвечает правилом на «шумно ли / тихо ли».
- `HotelBuilding.heightEstimated`: высота по оценке модели помечается отдельно от этажей.

## Capabilities

### New Capabilities

### Modified Capabilities

- `hotel-page`: раздел «Шум и окружение» настоящего отеля.
- `assistant-search`: ответ Эвала о шуме в чате отеля.

## Impact

- Код: `src/lib/noise.ts`, `src/lib/db/noise.ts`, `src/app/api/hotels/[hotelId]/noise-map/route.ts`, `src/components/HotelPage/{HotelNoise,NoiseMap}.tsx`, `HotelPage`, `HotelTabs`, `src/app/hotels/[hotelId]/page.tsx`, `src/lib/ai/hotelAnswer.ts`, `src/app/api/assistant/route.ts`, `src/lib/ota/page.ts`, `src/lib/hotelDetails.ts`, README.
- База: без миграций (RPC `hotel_geo`, `hotel_geo_features`, `osm_places_near` уже есть).
