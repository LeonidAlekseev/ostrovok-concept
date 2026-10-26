## 1. Скрипты

- [x] 1.1 `scripts/load-city-places.ts` и `npm run db:city-places`: параметры, Nominatim, место на диске, скачивание и md5, обрезка, запись, проверка, уборка, `--overpass` с откатом
- [x] 1.2 `--bbox` и `--centre` в `load-osm-places.ts`, прямоугольник в `osm-pbf-to-overpass.py`; область `preload` один раз на прямоугольник
- [x] 1.3 `centre` — `place=city|town` с именем, один на город по `--centre`

## 2. Проверка

- [x] 2.1 Тесты разбора параметров (`src/lib/geo/cityLoad.test.ts`)
- [x] 2.2 Dry-run Валенсии: 8962 места, временные файлы удалены
- [x] 2.3 README «Загрузка мест другого города»; `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
