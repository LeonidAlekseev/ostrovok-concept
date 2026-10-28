# Данные и скрипты

Supabase, каталог, скрипты загрузки и пересборки данных, места OSM.

## Supabase

Постоянные данные — в Supabase: аккаунты (`profiles`) и каталог (`destinations`, `hotels`: ключевые колонки, порядок
`position` и весь объект в `data jsonb`). Схема с RLS — `supabase/migrations/`: каталог читают все, пишет только
сервисный ключ, профиль читает и меняет владелец.

**Каталог в Supabase.** Интерфейс читает его на сервере через `src/lib/db/catalog.ts` (`server-only`, anon-ключ под
RLS): `loadDestinations`, `loadHotelSummaries`, `loadNewHotels`, `loadHotel`, `loadHotels(ids)`,
`loadCityHotels(destinationIds)`, `loadAllHotels`. Чтения кешируются `unstable_cache` с тегом `catalog` на час
(`CATALOG_LIFETIME`; полные отели — по городу на запись кеша); страницы с ними перестраиваются в фоне так же часто.
Ошибка базы — `CatalogUnavailableError`: страница показывает «Не удалось загрузить страницу» с «Повторить»
(`src/app/error.tsx`, `global-error.tsx`), API — 503. Клиент получает только нужное: направления — из корневого
layout (`CatalogProvider`, `useDestinations`), главная — новые отели и подборки пропсами, «Поиск вайба» и «Звёзды
подскажут» считают на сервере (server actions), остальное — `GET /api/hotels?ids=a,b` (избранное, поездки, бронь) или
`?destinations=x,y` (результаты): до 60 `id`, полные отели, `Cache-Control: s-maxage=300`. Общее у маршрутов
`src/app/api` — `src/lib/api.ts`: заголовок кэша CDN, ошибка `{ error }` с коротким английским текстом (браузер
смотрит только на статус) и отель маршрута `[hotelId]`, показанный в этом окружении. Общее у читателей `src/lib/db` —
`src/lib/db/anon.ts`: anon-клиент без сессии, проверка настоящего отеля, кэш каталога и «прочитать или `null`». Карта «Показать на карте»
открывается на кварталах вокруг отеля и грузит отели видимой области с запасом — `?bbox=west,south,east,north`
(`src/lib/mapBox.ts`: сторона до 0,1°, сетка 0,005°, до 200 отелей), уже загруженные остаются. Отель,
добавленный в базу после сборки, открывается без пересборки: `/hotels/<id>` рендерится при первом запросе и
кешируется. Генератор `src/lib/catalogGenerator.ts` — источник `db:seed` и фикстура тестов (`src/test/catalog.ts`),
в бандлы сайта не попадает. **После изменения данных** — `npm run db:seed`, затем ревалидация:
`npm run db:seed -- --revalidate https://<сайт>` (или `POST /api/revalidate` с `Authorization: Bearer
<SUPABASE_SERVICE_ROLE_KEY>`), иначе сайт обновится сам в течение часа. Сборка читает базу: без ключей она
останавливается с «нет NEXT_PUBLIC_SUPABASE_URL…: npm run secrets:reveal».

- `npm run db:types` — `scripts/db-types.mjs`: `supabase gen types typescript` по базе (`SUPABASE_DB_URL` из `.env`, схема
  только читается) в `src/lib/db/database.types.ts`, затем Prettier. Клиенты Supabase типизированы `Database`. **Перегенерируйте
  после каждой миграции** (`db:push`) и коммитьте файл вместе с ней. Следом скрипт обновляет раздел Supabase документации API
  (`npm run docs:supabase`, см. [«Документация API»](api.md#документация-api)).
- `npm run db:push` — применяет миграции (`supabase db push --db-url "$SUPABASE_DB_URL"`, строка из `.env`).
  Прямой адрес `db.<ref>.supabase.co` доступен только по IPv6; без IPv6 подставьте строку пулера
  (Dashboard → Connect → Transaction pooler, порт 6543) в `SUPABASE_DB_URL` окружения.
- `npm run db:seed` — `scripts/seed.ts` (Node исполняет TypeScript сам): строит каталог генератором
  `src/lib/catalogGenerator.ts` (с порядком `position`), делает upsert пачками по 100 и печатает число строк; повторный запуск оставляет те же строки.
  Создаёт демо-аккаунт «Демо-путешественник» из `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`, если его нет.
- `npm run db:seed:hotelier-demo` — `scripts/hotelier-demo.ts`: демо-переписки с отельером (`src/lib/hotelierDemo.ts`, после `npm run db:seed` и `npm run db:hotelier`).
  - 6 настоящих отелей Валенсии, 8 сценариев: известно, неизвестно → запрос Эвала, противоречие, вид, гарантия этажа, личный ответ.
  - Вопросы демо-путешественника, ответы демо-отельера, утверждения `hotelier.*` с источниками и векторами, чаты Эвала с блоком «Запрос отельеру».
  - Всё помечено `is_demo` и показывается с бейджем «демо».
  - Id — UUID v5 от ключей сценария: повторный запуск ничего не добавляет и чужие строки не трогает.
- `npm run db:hotelier-knowledge` — `scripts/hotelier-knowledge.ts`: повторяет то, что сервер делает в `after()` после
  ответа отельера (характеристики `hotelier.*`, документ поиска с векторами, ждущие запуски Эвала), для ответов, чьи
  сведения не сохранились (`knowledge_status` `queued`/`failed`) или ещё не обрабатывались; повторный запуск не плодит строк.
- `npm run db:hotelier` — `scripts/hotelier-account.ts`: аккаунт «Демо отельер» из `DEMO_HOTELIER_EMAIL`/
  `DEMO_HOTELIER_PASSWORD` и его профиль `hotelier_profiles` с `all_hotels` (отельер всех отелей); повторный запуск
  оставляет тот же аккаунт и профиль.
  `SUPABASE_SERVICE_ROLE_KEY` читают только этот скрипт и сервер, никогда клиент.
- `npm run db:seed:valencia -- <search.json>` — `scripts/seed-valencia.ts`: выдача Островка по Валенсии. Сырые отели
  кладёт в `ota_hotels` (ключ `master_id`, уникальный `ota_hotel_id`), остальное о поиске — в `ota_searches`, а отели
  каталога `ota-<master_id>` (маппер `src/lib/ota/hotel.ts`) — в `hotels` после сгенерированных. JSON в репозиторий
  не кладём. Печатает число строк; после загрузки — `npm run db:embed`.
- `uv run scripts/load-valencia-geo.py buildings [<ES52.parquet>]`, затем `… noise <ES.gpkg>` — геоданные города
  Валенсия (PostGIS, схема `extensions`): здания EUBUCCO v0.2 региона ES52 (город `city_id` ES46250) в `geo_buildings`
  — без пути DuckDB читает их с S3 EUBUCCO (`s3://eubucco/v0.2/buildings/parquet/nuts_id=ES52/ES52.parquet`, анонимно),
  только строки города; контуры шума EEA END 2022 (`ES.gpkg` из хранилища EEA,
  `eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00`, ~1,6 ГБ) по охвату зданий плюс 300 м в `geo_noise`. Файлы
  держим вне git. Каждая строка ссылается на набор в `geo_datasets` (название, версия, обработка) и хранит поля
  источника и уверенности набора под их именами: у зданий `*_source`, `*_source_id(s)`, `*_confidence*` (границы
  оценки высоты и этажности), у шума поставку Reportnet, исправление геометрии EEA и ширину полосы `band_db`. Каждая
  команда заменяет свою таблицу в одной транзакции; затем `npm run db:features`. Чтение: `hotel_geo(lat, lon)` —
  здание и шум в точке, `hotel_noise_facade(lat, lon)` — полосы EEA у фасада (самая громкая и самая тихая полоса
  каждого слоя у контура здания + 5 м или в круге 25 м без здания), `hotel_geo_features(lat, lon, radius_m)` — GeoJSON зданий (для `fill-extrusion`) и зон шума
  в круге, радиус 300 м по умолчанию, не больше 500 м; `hotel_noise_quiet(lat, lon, radius_m)` — тихая зона того же
  круга: где слои EEA размечены и ни один не достигает 40 дБ; `hotel_noise_day(lat, lon, radius_m)` — куски, где
  полоса Lden встречает полосу Lnight того же слоя (для оценки дня); `hotel_noise_map(lat, lon, radius_m)` — те же
  три части карты, посчитанные заранее (`hotel_noise_maps`, см. `db:features`), или `null`.
- `npm run db:features [-- --dry-run]` — `scripts/hotel-features.ts`: свойства настоящих отелей для Эвала — здание по
  `hotel_geo` и шум у фасада по `hotel_noise_facade` с оценкой `noise-estimate-v2` в `hotel_features` с их происхождением (наборы данных, источник и границы высоты и этажности),
  вид из номеров по названиям групп номеров `ota_hotels` в `hotel_room_views`, и карты шума вокруг каждого отеля в
  `hotel_noise_maps` (`hotel_noise_map_refresh` по одной точке: одна — до 2,1 с, четыре разом превышали лимит 8 с
  роли API; ~5 мин на 220 точек; карты точек без отеля удаляет `hotel_noise_maps_prune`). Карту на лету считать дорого: пересечения полигонов EEA в круге 300 м под
  нагрузкой занимали до 5,8 с при лимите anon 3 с, готовая читается за ~0,05 с. **После каждой перезагрузки
  геоданных** (`load-valencia-geo.py`) запускайте `db:features`, иначе карты останутся по старым контурам; отель без
  готовой карты получает карту, посчитанную на лету. Сырые данные не копирует, повторный запуск ничего не меняет в
  `hotel_features` и `hotel_room_views`; `--dry-run` только считает. Тот же запуск заполняет хранилище утверждений
  (`entities`, `claims`, `evidence`, `calculations`, `relations`, `documents`/`document_chunks`; схема — миграция
  `20261027220000_claims_evidence_store.sql`, строки — `src/lib/claimRows.ts`, запись — `scripts/lib/claims-store.ts`):
  полосы EEA у отеля (`reported`), оценка Lday (`derived` с расчётом), шумные места OSM в 200 м (связи `near` и
  расстояния), аптеки, супермаркеты, больницы, остановки, пляжи и парки в 1 км (по 5 ближайших каждой категории из
  кэша `osm_places`; место Островка тех же видов вместо совпавшего места OSM), ближайшее здание EUBUCCO в 50 м (связь
  `nearest_building`, высота и этажность), отзывы как документы с гибридным поиском (`hotel_chunks_hybrid`: слова и смысл) и их
  слова о шуме и тишине. У каждого утверждения — уверенность по политике `src/lib/confidence.ts` (версия в
  `method.confidence`). Пишет только новое и изменённое, повторный запуск ничего не дублирует. Чтение — `src/lib/db/claims.ts`. Затем — `npm run db:embed` и `npm run db:embed:chunks`.
- `npm run db:embed:chunks` — `scripts/embed-chunks.ts`: векторы фрагментов документов отелей (`document_chunks`:
  отзывы и сведения отельера) для гибридного поиска `hotel_chunks_hybrid`. Идемпотентен: `content_hash` (модель,
  размерность, текст) пишется только вместе с вектором, в модель уходят фрагменты без вектора и с изменённым текстом;
  пачки по 32, не больше 40 запросов в минуту, при 429 и 5xx — повтор с паузой. Фрагмент без вектора ищется по словам.
- `npm run db:embed:photos` — `scripts/embed-photos.ts`: векторы фото отелей Валенсии (`hotel_photo_embeddings`,
  `nvidia/llama-nemotron-embed-vl-1b-v2`, 2048 чисел) для «Найти похожие отели» по фото в чате Эвала. Идемпотентен:
  `content_hash` (модель, размерность, путь фото на CDN), в модель уходят только новые фото; фото без `url`, не
  WebP/JPEG и отвергнутые моделью (422) пропускаются, фото, которых нет в каталоге, удаляются. Пачки по 4, не больше 40
  запросов в минуту (около 2000 фото — 12–15 мин); `--dry-run` только считает.
  Запускать после `db:features`; нужен `NVIDIA_API_KEY`. Печатает: всего, посчитано, без изменений, ошибок.
- `npm run db:city-places -- --city <город> --pbf-url <выгрузка Geofabrik>` — `scripts/load-city-places.ts`: места
  OpenStreetMap города для гео-инструментов Эвала (`src/lib/geo`), вся загрузка одним шагом — см. «Загрузка мест
  другого города». Шаг записи отдельно — `npm run db:osm-places -- --bbox <s,w,n,e> [--centre <lat,lon>] [--file
<answer.json>] [--dry-run]` (`scripts/load-osm-places.ts`; без `--file` спрашивает overpass-api.de).
- `npm run db:embed` — `scripts/embed.ts`: векторы для поиска по смыслу (см. [«Поиск по смыслу»](search-and-ai.md#поиск-по-смыслу)) по каталогу из базы —
  все отели. В модель уходят только новые и изменённые отели (`content_hash`),
  векторы удалённых объектов стираются; пачки по 32, при 429 и 5xx — повтор с паузой 2, 4, 8… с. Печатает: всего, посчитано,
  без изменений, ошибок, удалено. Запускать после `db:seed`; нужен `NVIDIA_API_KEY`, не больше 40 запросов в минуту (лимит ключа), при 429 — ожидание
  (`Retry-After` или 2, 4, 8… с) и повтор.
  Модель входит в `content_hash`: после смены модели (`EMBEDDING_MODEL`) первый `npm run db:embed` пересчитывает
  векторы всех отелей (миграция не нужна; число отелей ÷ 32 запросов, не больше 40 в минуту), повторный — ничего не шлёт
  в модель. Пока переиндексация не прошла, поиск по смыслу сравнивает вектор запроса со старыми векторами другой
  модели — запускать её сразу после выкладки.
- `npm run db:clean:shared-photos [-- --delete]` — `scripts/clean-shared-photos.ts`: фото снимков «Поделиться» в
  публичном bucket без снимка (удалён вместе с аккаунтом или вручную); без `--delete` только показывает папки и число
  файлов. Папки моложе часа не трогает. Нужен `SUPABASE_SERVICE_ROLE_KEY`.

**Скрипты `scripts/`.** Исходные файлы данных вне репозитория, поэтому скрипты загрузки — единственный способ
восстановить базу; не удаляйте их. TypeScript-скрипты исполняет Node и начинают с `scripts/lib/node.ts`: он
разрешает импорты модулей приложения без расширения, даёт `required()` (переменная `.env` или ошибка с её
именем) и `serviceClient()` (клиент с сервисным ключом).

| Скрипт                                                                                | Назначение                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `seed.ts` (`db:seed`)                                                                 | каталог генератора и демо-аккаунт                                                                     |
| `seed-valencia.ts` (`db:seed:valencia`)                                               | выдача Островка по Валенсии: `ota_hotels`, `ota_searches`, отели каталога                             |
| `load-ota-pages.ts` (`db:load:ota-pages`)                                             | страницы отелей Островка: `ota_hotel_pages`, `ota_pois`, `ota_hotel_pois`, `ota_rate_spec_tags`       |
| `rebuild-ota-hotels.ts` (`db:rebuild:ota`)                                            | строки каталога настоящих отелей из `ota_hotels` и страниц                                            |
| `load-valencia-geo.py`                                                                | здания EUBUCCO, шум EEA и покрытие `geo_coverage`                                                     |
| `load-city-places.ts` (`db:city-places`)                                              | места OSM города одним шагом: выгрузка Geofabrik → `osm-pbf-to-overpass.py` → `load-osm-places.ts`    |
| `load-osm-places.ts` (`db:osm-places`)                                                | шаг записи мест OSM в `osm_places` и `osm_place_areas`                                                |
| `osm-pbf-to-overpass.py`                                                              | выгрузка `.osm.pbf` → ответ Overpass, когда Overpass недоступен                                       |
| `hotel-features.ts` (`db:features`)                                                   | свойства отелей, вид номеров, готовые карты шума, хранилище утверждений                               |
| `embed.ts` (`db:embed`)                                                               | векторы поиска по смыслу                                                                              |
| `embed-chunks.ts` (`db:embed:chunks`)                                                 | векторы фрагментов отзывов и сведений отельера                                                        |
| `embed-photos.ts` (`db:embed:photos`)                                                 | векторы фото отелей Валенсии для поиска похожих по фото                                               |
| `semantic-eval.ts`                                                                    | качество поиска по смыслу на живой базе                                                               |
| `clean-shared-photos.ts` (`db:clean:shared-photos`)                                   | фото снимков без снимка                                                                               |
| `db-push.mjs`, `db-types.mjs` (`db:push`, `db:types`)                                 | миграции и типы `Database`                                                                            |
| `secrets.mjs` (`secrets:*`)                                                           | ключи: `.env` ↔ `secrets.*.age`                                                                       |
| `screenshots.mjs`                                                                     | визуальная проверка страниц                                                                           |
| `openapi-supabase.ts` (`docs:supabase`)                                               | раздел Supabase документации API из `database.types.ts`                                               |
| `openapi-examples.ts` (`docs:examples`)                                               | реальные примеры ответов документации API с запущенного сайта                                         |
| `build-images.py`, `build-star-assets.mjs`, `build-draw-images.mjs`, `build-globe.py` | изображения и глобус из исходников вне репозитория (см. [«Изображения»](architecture.md#изображения)) |

### Загрузка мест другого города

Места для гео-инструментов Эвала (медицина, бары и клубы, еда, супермаркеты, транспорт, пляжи и берег, парки,
достопримечательности, центр) хранятся в `osm_places`, а загруженный прямоугольник — в `osm_place_areas`: внутри него
сервер отвечает из базы, вне — спрашивает Overpass онлайн и дописывает найденное. Город загружается одной командой:

```bash
npm run db:city-places -- --city València \
  --pbf-url https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf \
  --bbox 39.27,-0.53,39.58,-0.27 --dry-run
```

- `--city` — название для Nominatim и для имён временных файлов.
- `--pbf-url` — выгрузка региона с [Geofabrik](https://download.geofabrik.de/) (`.osm.pbf`, `https`), в которой лежит
  город; `.md5` рядом с ней проверяется.
- Парки и пляжи, нарисованные как relation, `scripts/osm-pbf-to-overpass.py` отдаёт с границей (`polygons`, их собирает pyosmium), загрузчик хранит её `MULTIPOLYGON`: расстояние считается до края парка, а не до его центра.
- `--bbox south,west,north,east` — прямоугольник загрузки: город, его отели с запасом, побережье, аэропорт. Без него —
  рамка города из Nominatim, расширенная на `--margin-km` (по умолчанию 3 км); аэропорт за городом в неё может не попасть.
- `--centre lat,lon` — центр города: категория `centre` остаётся только у ближайшего к нему узла `place=city|town`.
  Без него — точка города из Nominatim.
- `--tmp <dir>` — где держать временный каталог (по умолчанию системный `/tmp`); он удаляется в конце, даже после ошибки.
- `--overpass` — сначала загрузить прямо из overpass-api.de (одна попытка на группу категорий), при отказе — из выгрузки.
- `--dry-run` — скачать, разобрать и посчитать места по категориям, ничего не записывая.

Шаги: прямоугольник и центр → проверка свободного места (выгрузка × 4 + 500 МБ: выгрузка, индекс координат,
запас) → скачивание и md5 → `uv run scripts/osm-pbf-to-overpass.py` (обрезка по прямоугольнику и категориям) →
`scripts/load-osm-places.ts` (upsert в `osm_places`, прямоугольник `preload` — один раз, подсчёт по категориям в базе)
→ удаление временных файлов. Повторный запуск обновляет те же строки и не добавляет вторую область. Нужны `uv`,
`NEXT_PUBLIC_SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` (кроме `--dry-run`); ключи не печатаются. Пример:
Валенсия 2026-10-26 — выгрузка 134 МБ, 5 минут на разбор, 8962 места. Геокодирование Эвала сейчас ограничено
Валенсией (`VALENCIA_BBOX` в `src/lib/geo/distance.ts`): для другого города его тоже нужно расширить.
