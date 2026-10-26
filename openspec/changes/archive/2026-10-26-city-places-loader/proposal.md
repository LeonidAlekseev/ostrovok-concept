## Why

Загрузка мест Валенсии (`osm-places-cache`) шла вручную в несколько шагов, а прямоугольник был зашит в загрузчик и в конвертер выгрузки. Пользователь (2026-10-26) просит записать эти шаги одним скриптом, чтобы так же загрузить другой город.

## What Changes

- Один вход `npm run db:city-places -- --city <город> --pbf-url <выгрузка Geofabrik>`: прямоугольник и центр — параметры или из Nominatim, проверка свободного места, скачивание с md5, обрезка `osm-pbf-to-overpass.py`, запись `load-osm-places.ts`, подсчёт по категориям в базе, удаление временных файлов; Overpass по флагу `--overpass` с откатом на выгрузку.
- `load-osm-places.ts` и `osm-pbf-to-overpass.py` берут прямоугольник из параметров (`--bbox`), про Валенсию в них ничего нет; область `preload` пишется один раз на прямоугольник (было — одна на все).
- Категория `centre`: узлы `place=city|town` с именем (было только `city`); с `--centre` загрузчик оставляет её у ближайшего к центру узла.
- README: «Загрузка мест другого города».

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `assistant-geo`: новое требование «Загрузка мест города».

## Impact

- `scripts/load-city-places.ts` (новый), `scripts/load-osm-places.ts`, `scripts/osm-pbf-to-overpass.py`, `src/lib/geo/cityLoad.ts` с тестами, `src/lib/geo/categories.ts`, `package.json`, README.
- Данные Валенсии не меняются: dry-run даёт те же 8962 места.
