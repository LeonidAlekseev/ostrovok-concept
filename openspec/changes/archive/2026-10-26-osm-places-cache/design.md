## Context

Эвал отвечает за 9 с (`src/app/api/assistant/route.ts`), модели вызываются через Vercel AI SDK (`ai`) и цепочки `src/lib/ai/chain.ts`. В Supabase уже есть PostGIS 3.3.7 в схеме `extensions` и геоданные Валенсии (`geo_buildings`, `geo_noise`, RPC `hotel_geo`). Отели Валенсии лежат в прямоугольнике 39.308–39.551 с. ш., −0.492…−0.298 в. д. (221 отель, живая база 2026-10-26). Образец — osmmcp (Go, MIT): клиенты Nominatim, Overpass, OSRM, гаверсинус, лимиты частоты по сервисам.

## Goals / Non-Goals

**Goals:**
- Ядро на TypeScript: Nominatim (прямое и обратное геокодирование), места рядом по категориям, расстояние, пешеходный маршрут с фоллбэком «по прямой».
- Кэш мест в PostGIS: заранее загруженная Валенсия плюс вечная дозапись найденного онлайн.
- Инструменты AI SDK с zod-схемами и типизированными результатами, пригодными для карты.
- Честные ошибки сервисов, лимиты частоты, таймауты под бюджет хода.

**Non-Goals:**
- Вызов инструментов в ходе Эвала, сообщение с картой (`assistant-map-message`).
- Маршруты на машине и транспорте, время в пути на такси.
- Удаление и устаревание записей кэша.

## Decisions

### Модули `src/lib/geo/`

- `distance.ts` — гаверсинус (радиус Земли 6 371 000 м, как в osmmcp), минуты пешком (5 км/ч), прямоугольник Валенсии.
- `categories.ts` — категории, их подписи по-русски, фильтры Overpass и `categorize(tags)`: элемент получает все подходящие категории (ресторан может быть и достопримечательностью).
- `http.ts` — запрос к сервису OSM: User-Agent `ostrovok-concept/1.0 (+https://github.com/LeonidAlekseev/ostrovok-concept)` (адрес репозитория, без личной почты), таймаут, разбор 429/502/503/504 и `Retry-After`, перевод сбоев в `GeoFailure`.
- `limits.ts` — ворота частоты на сервис: интервал между запросами в памяти и, на сервере, общий счётчик `rate_limit_hit` (миграция 20261026120000) для всех инстансов. После 429 сервис «закрыт» до конца `Retry-After`: запросы не уходят, сразу возвращается «подождите N с».
- `nominatim.ts`, `overpass.ts`, `osrm.ts` — построение запросов и разбор ответов, чистые функции разбора тестируются на фикстурах.
- `places.ts` — места рядом: кэш, затем Overpass для непокрытых категорий, дозапись; геокодирование с дозаписью найденного места.
- `store.ts` (server-only) — чтение через RPC и запись service role в Supabase.
- `tools.ts` — `tool()` AI SDK: `geocode`, `reverseGeocode`, `nearbyPlaces`, `walkingRoute`.

Альтернатива — MCP-сервер osmmcp как процесс — отвергнута: Go-бинарник и `child_process` не работают в Vercel Functions, MCP SDK лишний слой.

### Результаты

`GeoResult<T> = { ok: true, value: T } | GeoFailure`. `GeoFailure.reason`: `limited` (с `retryAfterS`), `unavailable`, `timeout`, `not-found`, `outside` (точка вне области поиска), у каждого `message` по-русски для ответа пользователю. Место — `Place` (OSM тип и id, имя, категории, центр `lat/lon`, ближайшая точка формы, расстояние в метрах, теги, источник и атрибуция). Маршрут — `{ kind: 'foot' | 'straight', distanceM, durationS, geometry: LineString }`; у `straight` есть `note: 'по прямой'` и причина. Геометрия — GeoJSON `[lon, lat]`, её рисует MapLibre без преобразований.

### Хранение (миграция 20261026130000_osm_places.sql)

- `osm_places`: ключ `(osm_type, osm_id)`, `name`, `categories text[]` (GIN), `tags jsonb`, центр `lat/lon` (маркер на карте), `geom geography` (GiST) — форма для расстояний: точка, линия берега, многоугольник пляжа или парка; `origin` (`preload` | `online`), `fetched_at`, `attribution`. До моря и пляжа считается расстояние до формы (`ST_Distance`), а не до центра пляжа, который бывает в сотнях метров от воды. Отношения (relation) хранятся центром: сборка мультиполигонов из Overpass не нужна для расстояний в городе.
- `osm_place_areas`: какие области (`geography` многоугольник) и какие категории загружены, `origin`, `loaded_at`. Без этой таблицы «в базе ничего нет» нельзя отличить от «рядом ничего нет», и каждый честный ноль гонял бы Overpass.
- Чтение — `osm_places_near(lat, lon, radius_m, wanted, per_category)`, `security definer`, `search_path = ''`: ближайшие места каждой категории (`ST_DWithin` по `geography`, сортировка по `ST_Distance`) и список категорий, покрытых загруженными областями для этого круга. Данные OSM публичные, RPC доступна `anon`, `authenticated`, `service_role`.
- Запись — только service role: upsert строк `osm_places` через PostgREST (геометрия как EWKT) и `osm_place_area_add(lat, lon, radius_m | bbox, categories, origin)`, которая сама строит круг `ST_Buffer` — так проверка покрытия считает тот же круг тем же способом.
- RLS включён, политик нет; `anon` и `authenticated` таблицы не видят.
- Срока хранения нет, записи не удаляются; повторная загрузка обновляет строку (теги, геометрия, `fetched_at`).

### Состав предзагрузки

Прямоугольник 39.27–39.58 с. ш., −0.53…−0.27 в. д.: все отели Валенсии с запасом ~3 км, город, пляжи и берег от Пинедо до Эль-Салера и Альбуфера, аэропорт Манисес. Категории — по вопросам гостей отеля:

| Категория | Теги OSM | Зачем |
|---|---|---|
| hospital | `amenity=hospital`, `healthcare=hospital` | «есть ли рядом больница» |
| clinic | `amenity=clinic`, `amenity=doctors`, `healthcare=clinic` | врач без больницы |
| pharmacy | `amenity=pharmacy`, `healthcare=pharmacy` | «сколько до аптеки» |
| bar, nightclub | `amenity=bar\|pub`, `amenity=nightclub` | «бар/клуб рядом» — и как плюс, и как шум |
| restaurant, fast_food, cafe | `amenity=restaurant`, `fast_food`, `cafe` | где поесть |
| supermarket, convenience | `shop=supermarket`, `shop=convenience` | продукты |
| metro, tram, train_station, bus_stop | `railway=station\|halt` + `station=subway`, `railway=tram_stop` или `station=light_rail`, прочие станции, `highway=bus_stop` | «сколько до метро», транспорт |
| airport | `aeroway=aerodrome` | «сколько до аэропорта» |
| beach, sea | `natural=beach`, `natural=coastline` | «сколько до моря» |
| park | `leisure=park` | прогулки |
| attraction, viewpoint, museum | `tourism=attraction\|viewpoint\|museum` | что посмотреть |
| centre | `place=city` (узел «València») | «сколько до центра» |

Не грузятся: банкоматы, магазины одежды, школы, спортзалы — гости о них спрашивают редко, а объём вырос бы в разы; их найдёт онлайн-запрос, если категорию добавят.

### Загрузка

`scripts/load-osm-places.ts` (`npm run db:osm-places`, Node запускает TypeScript сам, как `seed-valencia.ts`) использует те же `categorize` и разбор Overpass, что и сервер: по умолчанию — шесть запросов по группам категорий к overpass-api.de с паузами и повторами после 429/502/504. Второй путь — `--file` с JSON в формате Overpass. Его делает `scripts/osm-pbf-to-overpass.py` (pyosmium через `uv run`, как `load-valencia-geo.py`) из выгрузки Geofabrik `valencia-latest.osm.pbf` (141 МБ): широкий фильтр по тегам и прямоугольнику, индекс координат в файле, а не в памяти (3 ГБ RAM на машине), центры отношений — по рамке их линий. Категории всё равно назначает TypeScript, поэтому список тегов в Python — надмножество, а не вторая копия правил. 2026-10-26 overpass-api.de весь день отвечал 502 «at capacity», зеркала были недоступны, и Валенсия загружена вторым путём из выгрузки от 2026-10-25; pbf удалён после конвертации, JSON — после загрузки. Upsert пачками по 200, затем прямоугольник с категориями пишется в `osm_place_areas` один раз.

### Онлайн и дозапись

`nearbyPlaces`: RPC отдаёт места и покрытые категории; для непокрытых категорий — один запрос Overpass по кругу (`around`), найденное и круг с категориями пишутся в базу, ответ собирается из базы и найденного. Если Overpass отказал, отдаются места из кэша и `GeoFailure` по непокрытым категориям — без выдумки. `geocode` сначала ищет в кэше точное совпадение имени, иначе Nominatim (viewbox Валенсии, `bounded=1`), найденное место дописывается с категориями по `categorize` или `other`.

### Время

Бюджет хода — 9 с. У каждого вызова свой предел и общий дедлайн хода: Nominatim 2,5 с, Overpass 4 с (и `[timeout:4]` в запросе), OSRM 2,5 с, RPC 2 с; вызов не начинается, если до дедлайна меньше 300 мс. Ожидание очереди лимита не дольше остатка бюджета, иначе — `limited`.

### Лимиты

Nominatim — 1 запрос в секунду (правила OSMF). Overpass — не больше 10 запросов в минуту (osmmcp держит 2 в минуту для фоновой работы; онлайн-дозапись редкая, и после 429 сервис закрывается по `Retry-After`). OSRM FOSSGIS — 1 запрос в секунду. Ключи общего счётчика — `osm:nominatim`, `osm:overpass`, `osm:osrm`.

## Risks / Trade-offs

- Публичные сервисы перегружены (overpass-api.de отвечал 502 «at capacity» при разработке) → кэш закрывает Валенсию без онлайна, ответы честно говорят «не удалось проверить».
- `rate_limit_hit` даёт окно в целую секунду → Nominatim получает не больше одного запроса в секунду на все инстансы; цена — лишний запрос к базе (~100 мс) на вызов.
- Центр отношения вместо формы → расстояние до большого парка-отношения может быть завышено на сотни метров; для пляжей и берега формы есть (ways).
- Одна категория `sea` по линиям берега: порт и каналы тоже `coastline` → «до моря» может показать берег порта; в ответе видно место и расстояние.

## Migration Plan

`npm run db:push` применяет миграцию (идемпотентна), `npm run db:osm-places` загружает точки, `npm run db:types` обновляет типы. Откат — в шапке миграции (`drop function …; drop table …`); приложение без таблиц получает `unavailable` от RPC.

## Open Questions

Нет.
