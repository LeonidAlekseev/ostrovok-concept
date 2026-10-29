# Источники данных

Откуда какие данные в базе, каким скриптом они загружены и как обработаны. Подробности команд — в
[«Данные и скрипты»](data-and-scripts.md), методы расчётов — в [«Методы гео-расчётов»](geo-methods.md). Схема —
`supabase/migrations/`. Исходные файлы лежат вне репозитория, поэтому скрипты загрузки нельзя удалять.

## Оглавление

- [Как собрать базу](#как-собрать-базу)
- [Таблицы и первоисточники](#таблицы-и-первоисточники)
- [Что в `make seed` и `make seed-local`, а что нет](#что-в-make-seed-и-make-seed-local-а-что-нет)
  - [`make seed-local-geo`](#make-seed-local-geo-геоданные-валенсии-в-локальную-базу)

## Как собрать базу

Порядок для новой базы (все шаги идемпотентны, повторный запуск ничего не дублирует):

1. `npm run db:push` — миграции (`supabase/migrations/`).
2. `npm run db:seed`, `npm run db:hotelier` — синтетический каталог и демо-аккаунты.
3. `npm run db:seed:valencia -- <search.json>`, `npm run db:load:ota-pages -- <dir>`, `npm run db:rebuild:ota` — настоящие
   отели Островка по Валенсии.
4. `uv run scripts/load-valencia-geo.py buildings|noise|coverage`, `npm run db:city-places -- …` — здания, шум, места OSM.
5. `npm run db:features`, затем `npm run db:embed`, `npm run db:embed:chunks`, `npm run db:embed:photos` — производные
   данные и векторы.
6. `npm run db:seed:hotelier-demo` — демо-переписки с отельером (нужны настоящие отели из шага 3).

Для облачной базы шаги 1, 2, 5 и 6 выполняет `make seed`, для локальной — `make seed-local` (оба запускают
`scripts/seed-all.sh`). Шаг 4 для локальной базы выполняет `make seed-local-geo` (`scripts/seed-local-geo.sh`), см. ниже.

## Таблицы и первоисточники

| Таблицы                                                                                                      | Первоисточник                                                                                                                               | Скрипт и команда                                                                                                      | Обработка                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destinations`, `hotels` (синтетические отели)                                                               | Генератор `src/lib/catalogGenerator.ts` и `src/data/destinations.ts`; в репозитории                                                         | `scripts/seed.ts`: `npm run db:seed`                                                                                  | Upsert пачками по 100, порядок `position`; ключевые колонки и полный объект в `data jsonb`.                                                                                                                |
| `ota_hotels`, `ota_searches`, отели `ota-<master_id>` в `hotels`                                             | Выдача поиска Островка по Валенсии (JSON, вне git)                                                                                          | `scripts/seed-valencia.ts`: `npm run db:seed:valencia -- <search.json>`                                               | Сырые отели в `ota_hotels` (ключ `master_id`), остальное о поиске в `ota_searches`; строка каталога строится маппером `src/lib/ota/hotel.ts`, слитые дубли отбрасываются (`src/lib/ota/merged.ts`).        |
| `ota_hotel_pages`, `ota_pois`, `ota_hotel_pois`, `ota_rate_spec_tags`                                        | Лицензионные снимки страниц отелей Островка (`<dir>/<master_id>.json`, вне git)                                                             | `scripts/load-ota-pages.ts`: `npm run db:load:ota-pages -- <dir>`                                                     | Страница без контактов, аналитики и настроек; места интереса по одному разу с точкой; файлы считаются недоверенными (только JSON, до 4 МБ).                                                                |
| строки `ota-*` в `hotels` (описание, время заезда, рабочее место)                                            | `ota_hotels` и `ota_hotel_pages`                                                                                                            | `scripts/rebuild-ota-hotels.ts`: `npm run db:rebuild:ota`                                                             | Пересборка строк настоящих отелей без поискового JSON; без Wi‑Fi, отзывов и оценок разделов, которых в данных нет.                                                                                         |
| `geo_datasets`, `geo_buildings`                                                                              | EUBUCCO v0.2, регион ES52, город Валенсия (`city_id` ES46250); S3 EUBUCCO или локальный `ES52.parquet`                                      | `scripts/load-valencia-geo.py`: `uv run scripts/load-valencia-geo.py buildings [<ES52.parquet>]`                      | DuckDB читает только строки города; контуры лишь перепроецируются (EPSG:3035), геометрия чинится `st_makevalid` только там, где невалидна; у каждой строки источник и границы уверенности высоты и этажей. |
| `geo_noise`                                                                                                  | Карты шума EEA (Environmental Noise Directive, раунд 2022, Испания): `ES.gpkg`, ~1,6 ГБ                                                     | `uv run scripts/load-valencia-geo.py noise <ES.gpkg>`                                                                 | Контуры в охвате зданий плюс 300 м, упрощение на 2 м, деление на куски до 256 вершин; хранится полоса `band_db` и происхождение поставки.                                                                  |
| `geo_coverage`                                                                                               | Границы OpenStreetMap муниципалитета València (relation 344953, INE 46250) и провинции Valencia (relation 349000) через Nominatim `/lookup` | `uv run scripts/load-valencia-geo.py coverage`                                                                        | Где здания известны: внутри муниципалитета; вокруг суша без зданий, море не считается.                                                                                                                     |
| `osm_places`, `osm_place_areas`                                                                              | OpenStreetMap: выгрузка региона Geofabrik (`.osm.pbf`) или Overpass; границы города из Nominatim                                            | `scripts/load-city-places.ts`: `npm run db:city-places -- --city València --pbf-url …` (шаг записи — `db:osm-places`) | `scripts/osm-pbf-to-overpass.py` обрезает выгрузку по прямоугольнику и категориям; парки и пляжи хранятся с границей (`MULTIPOLYGON`); загруженный прямоугольник записан в `osm_place_areas`.              |
| `hotel_features`, `hotel_room_views`, `hotel_noise_maps`                                                     | Производные: `geo_buildings`, `geo_noise`, `osm_places`, названия групп номеров из `ota_hotels`                                             | `scripts/hotel-features.ts`: `npm run db:features`                                                                    | Здание и шум у фасада, оценка `noise-estimate-v2`, вид из номеров по названиям, заранее посчитанные карты шума; сырых данных не копирует.                                                                  |
| `entities`, `claims`, `evidence`, `calculations`, `relations`, `documents`, `document_chunks`                | Те же источники плюс страницы отелей (отзывы, факты) и ответы отельеров                                                                     | `npm run db:features`; сведения отельера — сервер и `npm run db:hotelier-knowledge`                                   | Каждое утверждение с уверенностью по `src/lib/confidence.ts`, доказательством и расчётом; отзывы нарезаны на фрагменты для гибридного поиска `hotel_chunks_hybrid`.                                        |
| `embeddings`                                                                                                 | Каталог отелей из базы; модель `nvidia/nemotron-3.5-embed-1b` (NVIDIA API)                                                                  | `scripts/embed.ts`: `npm run db:embed`                                                                                | Пачки по 32, до 40 запросов в минуту; в модель уходят только новые и изменённые отели (`content_hash`).                                                                                                    |
| `document_chunks.embedding`                                                                                  | Фрагменты отзывов и сведений отельера; та же модель                                                                                         | `scripts/embed-chunks.ts`: `npm run db:embed:chunks`                                                                  | Пачки по 32; фрагмент без вектора ищется по словам.                                                                                                                                                        |
| `hotel_photo_embeddings`                                                                                     | Фото отелей Валенсии из каталога; модель `nvidia/llama-nemotron-embed-vl-1b-v2` (NVIDIA API)                                                | `scripts/embed-photos.ts`: `npm run db:embed:photos`                                                                  | Пачки по 4; фото не WebP/JPEG и отвергнутые моделью пропускаются, исчезнувшие из каталога удаляются.                                                                                                       |
| `hotelier_*`, `assistant_*` (демо-часть)                                                                     | Сценарии `src/lib/hotelierDemo.ts` (6 настоящих отелей Валенсии); аккаунты из `DEMO_USER_*` и `DEMO_HOTELIER_*`                             | `npm run db:hotelier`, `npm run db:seed:hotelier-demo`                                                                | Всё помечено `is_demo` и показывается с бейджем «демо»; id — UUID v5 от ключей сценария.                                                                                                                   |
| `profiles`, `assistant_chats`, `assistant_messages`, `assistant_chat_shares`, `rate_limit_hits`, `tool_runs` | Работа сайта: пользователи, чаты, снимки «Поделиться», счётчики                                                                             | Не загружаются                                                                                                        | Создаются приложением; демо-аккаунт путешественника — `npm run db:seed`.                                                                                                                                   |

Модели ответов (GigaChat, NVIDIA) в базу данные не кладут: ключи берутся из `.env` и остаются удалёнными и в локальном
варианте. Сведения, которых нет в первоисточнике, скрипты не придумывают.

## Что в `make seed` и `make seed-local`, а что нет

`scripts/seed-all.sh` выполняет `db:push`, `db:seed`, `db:hotelier`, `db:seed:hotelier-demo`, `db:rebuild:ota`,
`db:features`, `db:embed`, `db:embed:chunks`, `db:embed:photos`. Загрузки из внешних файлов (`db:seed:valencia`,
`db:load:ota-pages`, `load-valencia-geo.py`, `db:city-places`) в него не входят: файлов нет в репозитории. Поэтому
локальная база после `make seed-local` содержит синтетический каталог и демо-аккаунты; демо-переписки с отельером
пропускаются (`no hotel ota-…, skipped`), пока нет настоящих отелей. Внешние шаги выполняются в том же контейнере:
`docker compose --env-file .env.local-supabase -f docker-compose.local.yml run --rm -v <папка с файлами>:/data:ro tools npm run db:seed:valencia -- /data/search.json`.

### `make seed-local-geo`: геоданные Валенсии в локальную базу

Запускать после `make seed-local` (миграции применены). Команда `scripts/seed-local-geo.sh` в контейнере `tools` берёт
данные прямо из первоисточников, по порядку:

| Шаг | Что делает                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `uv run scripts/load-valencia-geo.py buildings` — здания EUBUCCO с S3 (`s3.eubucco.com`, анонимно, без локального файла; DuckDB читает только строки города)        |
| 2   | `… noise $NOISE_GPKG` — шум EEA, только если задан `NOISE_GPKG` (ручной шаг, см. ниже), иначе пропуск с подсказкой                                                  |
| 3   | `… coverage` — границы муниципалитета и провинции через Nominatim                                                                                                   |
| 4   | `npm run db:city-places -- --city València --pbf-url https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf --bbox 39.27,-0.53,39.58,-0.27` — места OSM |
| 5   | `npm run db:features` — здание, шум, окружение, вид из номера                                                                                                       |
| 6   | `npm run db:embed:chunks` — векторы новых фрагментов, если в `.env` есть `NVIDIA_API_KEY`                                                                           |

Шум EEA (`ES.gpkg`, ~1,6 ГБ) скачивается руками со [страницы EEA](https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00)
(файл `ES.gpkg`); путь передаётся переменной: `NOISE_GPKG=/путь/к/ES.gpkg make seed-local-geo`. Makefile монтирует файл в
контейнер только для чтения. Без переменной шаг пропускается, а `db:features` считает шум по тому, что есть в базе.
Загрузка мест — скачивание 141 МБ выгрузки Geofabrik «Valencia» (регион внутри Spain, отдельно от всей Spain в 1,5 ГБ),
обрезка по прямоугольнику города и запись; временные файлы удаляются. Проверка адресов: HEAD-запросы к Geofabrik, EUBUCCO
и EEA вернули 200 (2026-10-29). Признаки считаются для настоящих отелей Островка (шаг 3 «Как собрать базу»), поэтому без них `db:features` ничего не добавит. Команда идемпотентна.

[← README](../README.md)
