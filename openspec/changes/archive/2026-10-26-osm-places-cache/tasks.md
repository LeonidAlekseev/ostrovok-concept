## 1. OpenSpec

- [x] 1.1 proposal, design, tasks, спецификация `assistant-geo`

## 2. База

- [x] 2.1 Миграция `20261026130000_osm_places.sql`: `osm_places`, `osm_place_areas`, RLS, `osm_places_near`, `osm_place_area_add`; идемпотентна
- [x] 2.2 Применить к живой базе `npm run db:push`, обновить `src/lib/db/database.types.ts` (`npm run db:types`)

## 3. Ядро `src/lib/geo/`

- [x] 3.1 Гаверсинус, минуты пешком, прямоугольник Валенсии
- [x] 3.2 Категории и `categorize(tags)`, фильтры Overpass
- [x] 3.3 HTTP к OSM: User-Agent, таймауты, разбор 429/5xx, `GeoFailure`; лимиты частоты (память + `rate_limit_hit`)
- [x] 3.4 Nominatim: геокодирование (viewbox Валенсии, bounded) и обратное, разбор ответов
- [x] 3.5 Overpass: запрос по кругу и по прямоугольнику, разбор элементов в места с геометрией
- [x] 3.6 OSRM `routed-foot`: маршрут с GeoJSON, фоллбэк «по прямой»
- [x] 3.7 Места рядом: кэш, онлайн для непокрытых категорий, дозапись; геокодирование с дозаписью
- [x] 3.8 Хранилище Supabase (server-only), инструменты `tool()` AI SDK с zod-схемами

## 4. Загрузка

- [x] 4.1 Скрипт `scripts/load-osm-places.ts` (`npm run db:osm-places`), Overpass по группам или файл выгрузки (`scripts/osm-pbf-to-overpass.py` из Geofabrik)
- [x] 4.2 Загрузить Валенсию в живую базу, записать числа по категориям и размер таблиц — 2026-10-26 из выгрузки Geofabrik от 2026-10-25 (Overpass отвечал 502): 8962 места (7713 точек, 1176 многоугольников, 73 линии), `osm_places` 10 МБ с индексами, одна область `preload`

## 5. Проверка

- [x] 5.1 Тесты Vitest без сети: гаверсинус, разбор Overpass/OSRM/Nominatim на фикстурах, «по прямой», дозапись, лимиты
- [x] 5.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`
