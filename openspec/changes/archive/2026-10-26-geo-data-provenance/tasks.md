## 1. Исследование данных

- [x] 1.1 Схема EUBUCCO v0.2 `ES52.parquet` (DuckDB `DESCRIBE`, GeoParquet-метаданные), распределения источников и границ в городе ES46250
- [x] 1.2 Схема EEA `ES.gpkg` (`ST_Read_Meta`, служебные таблицы GeoPackage), значения полей в охвате Валенсии
- [x] 1.3 Найденное и отсутствующее — в design.md

## 2. Миграция

- [x] 2.1 `geo_datasets`, колонки происхождения `geo_buildings` и `geo_noise`, `band_db`, `made_valid`
- [x] 2.2 Ограничения: валидная непустая геометрия, значения и границы
- [x] 2.3 Происхождение в `hotel_features` и в ответе `hotel_geo`
- [x] 2.4 `hotel_geo_features(lat, lon, radius_m)`: GeoJSON, радиус 300 м по умолчанию, не больше 500 м (замер времени и размера)

## 3. Загрузка

- [x] 3.1 `scripts/load-valencia-geo.py buildings [<parquet>]`: S3 EUBUCCO или локальный файл, город ES46250, все поля происхождения
- [x] 3.2 `scripts/load-valencia-geo.py noise <ES.gpkg>`: охват по зданиям из базы, поля EEA, `made_valid`
- [x] 3.3 `scripts/hotel-features.ts`, `src/lib/featureRows.ts` и тесты: происхождение в `hotel_features`
- [x] 3.4 README

## 4. Применение и проверка

- [x] 4.1 `npm run db:push`, загрузка обоих наборов, `npm run db:features`, `npm run db:types`
- [x] 4.2 Проверочные запросы: числа строк, источники, валидность, ответ `hotel_geo_features`
- [x] 4.3 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
