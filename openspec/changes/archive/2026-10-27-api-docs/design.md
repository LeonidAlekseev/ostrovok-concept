## Context

Маршруты `src/app/api` — route handlers Next 16 без Cache Components. В проекте zod 4.6 (у него свой `z.toJSONSchema` с целью draft-2020-12 и реестрами метаданных), MapLibre с общей настройкой `SearchResultsPage/mapSetup.ts`. Supabase отдаёт OpenAPI PostgREST на `/rest/v1/` только с ключом service role (с anon — 401 «Only the service_role API key can be used»), поэтому брать его на лету нельзя.

## Decisions

### Схемы рядом с маршрутами
У каждого маршрута `schema.ts`: схемы параметров, тела, ответа и описание операций (`ApiOperation`: метод, путь, теги, параметры, тело, ответы с примерами, безопасность). Общие части (отель, сводка отеля, функции для Эвала) — в `src/app/api/hotels/schema.ts` и подключаются остальными. Чтобы схема и код не расходились:
- маршрут разбирает запрос этими же схемами (`/api/hotels`: `ids`, `destinations`, `bbox`; `/api/assistant`: тело);
- ответ маршрута — `satisfies` типа из схемы;
- схема сверяется с доменным типом взаимной присваиваемостью (`SameType<z.output<…>, Hotel>`), ошибка — на `npm run typecheck`.

Альтернатива — `@asteasolutions/zod-to-openapi` или `zod-openapi`: лишняя зависимость, а `z.toJSONSchema` уже делает JSON Schema 2020-12, родную для OpenAPI 3.1.

### Документ
`src/lib/openapi/document.ts` собирает операции всех `schema.ts`. Схемы с `id` в реестре `apiSchemas` попадают в `components/schemas` одним вызовом `z.toJSONSchema(apiSchemas, { uri })` и ссылаются друг на друга через `#/components/schemas/…`; параметры и тела запросов — встроенные схемы (`io: 'input'`). Сервер — `/`: «Try it» идёт на то окружение, где открыта страница. Маршрут `GET /api/openapi.json` статический (`dynamic = 'force-static'`), без условий по окружению.

### Примеры
Только реальные ответы: `npm run docs:examples` берёт у запущенного сайта ответы по ota-9096882 (отель, рамка вокруг него, вид, карты, вопрос Эвалу о местах рядом) и сокращает массивы (несколько комнат, фото, отзывов, зданий карты), записывая `src/lib/openapi/examples/*.json`. Примеры ошибок — тексты из кода маршрутов.

### Раздел Supabase
`scripts/openapi-supabase.ts` читает `database.types.ts` TypeScript Compiler API и находит в `src` вызовы `.from('…')` и `.rpc('…')`. Для таблиц и представлений — `GET /{table}` с `Row`, для функций — `POST /rpc/{name}` с `Args` и `Returns`; `x-used-in` — файлы, где вызов. Результат `src/lib/openapi/supabase.gen.json` проверяется тестом: генерация заново даёт тот же файл. Сервер — `NEXT_PUBLIC_SUPABASE_URL/rest/v1` (публичный адрес), ключ `apikey` вводит сам разработчик; доступ определяют RLS и права базы.

### Страница
Scalar (`@scalar/api-reference-react`): OpenAPI 3.1, «Try it» встроен, React-обёртка без SSR, есть хук `onResponseReceived` — копия ответа приходит странице. Swagger UI тяжелее и с OpenAPI 3.1 частично, Redoc без «Try it». Scalar не даёт встроить свой компонент в панель ответа, поэтому `/api/docs` — своя страница-обёртка: шапка сайта, Scalar и панель «Карта ответа» (MapLibre, `MAP_STYLE`, `manageAttribution`) — справа на широком экране и снизу на узком. Ответ гео-маршрута превращается в GeoJSON (`geoOfResponse`): отели — точки, вид — лучи и цели от отеля, здания и шум — полигоны, карта Эвала — точки и маршруты. Кнопки «Пример на карте» показывают примеры документа без запроса. Страница и документ — во всех окружениях.

## Risks

- Scalar тяжёлый (Vue внутри) — грузится только на `/api/docs`, динамически на клиенте.
- `database.types.ts` обновили без `docs:supabase` — тест сверки упадёт и подскажет команду; `db:types` запускает генерацию сам.
- Примеры устаревают при пересборке каталога — `npm run docs:examples` обновляет их; схема проверяется тестом на примерах.
