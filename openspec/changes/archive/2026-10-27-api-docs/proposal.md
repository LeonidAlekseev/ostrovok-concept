## Why

У сайта шесть маршрутов `src/app/api` (поиск отелей по id, городам и рамке карты, вид из отеля, карты зданий и шума, Эвал, сброс кэша каталога), а описаны они только в комментариях кода. Ответы не имеют схем: типы есть в TypeScript, но клиенту, тестам и разработчику не на что опереться, а новый маршрут легко забыть описать. Гео-ответы (вид, шум, места и маршруты Эвала) — это GeoJSON и точки, которые по JSON не понять без карты.

## What Changes

- Схемы zod запросов и ответов рядом с каждым маршрутом (`schema.ts`); маршруты берут из них разбор запроса, а ответы проверяются компилятором на совпадение со схемой (`satisfies`) и со своими доменными типами (`Hotel`, `HotelView`, `ViewMap`, `NoiseMap`, `AssistantResponse`).
- Документ OpenAPI 3.1 генерируется из этих схем (`z.toJSONSchema` zod 4, JSON Schema 2020-12) и отдаётся маршрутом `GET /api/openapi.json`; примеры ответов — реальные ответы по отелю ota-9096882 (Валенсия), сокращённые по длине массивов.
- Раздел Supabase — отдельный документ `GET /api/openapi/supabase.json`: таблицы, представления и функции (RPC), которые вызывает код `src`, со схемами из `database.types.ts`, сгенерированный скриптом без ключей.
- Страница `/api/docs`: интерактивная документация Scalar с «Try it» против текущего окружения и карта MapLibre рядом с ответом гео-запроса (и для примеров ответа).
- Пункт «API» в меню сайта, во всех окружениях.
- Тесты: документ валиден как OpenAPI 3.1, каждый маршрут и метод `src/app/api` описан, сгенерированный раздел Supabase совпадает с `database.types.ts`, в меню есть «API».

## Capabilities

### New Capabilities

- `api-docs`: схемы маршрутов, документ OpenAPI, раздел Supabase, страница документации с картой.

### Modified Capabilities

- `site-header`: пункт меню «API».

## Impact

- Код: `src/app/api/**/schema.ts`, маршруты `src/app/api`, `src/lib/openapi/*`, `src/app/api/docs/page.tsx`, `src/components/ApiDocs/*`, `src/components/Header/Header.tsx`, `src/lib/mapBox.ts`.
- Скрипты: `scripts/openapi-supabase.ts` (`npm run docs:supabase`, и после `npm run db:types`), `scripts/openapi-examples.ts` (`npm run docs:examples`).
- Зависимость: `@scalar/api-reference-react` (только страница `/api/docs`, грузится на клиенте).
- Секреты: ни в документе, ни на странице нет значений ключей; `POST /api/revalidate` описан со схемой bearer без значения.
