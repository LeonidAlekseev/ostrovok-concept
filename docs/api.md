# API

Документация API (`/api/docs`) и маршруты `src/app/api`.

## Документация API

`/api/docs` (ссылка «API Docs» в меню, во всех окружениях): интерактивная документация Scalar
(`@scalar/api-reference-react`, грузится только на этой странице) двух документов OpenAPI 3.1 и карта MapLibre ответа
гео-маршрута рядом с ответом «Try it» (`src/components/ApiDocs`). «Try it» шлёт запрос в то окружение, где открыта
страница (сервер документа — `/`).

- `GET /api/openapi.json` — маршруты `src/app/api`. Схемы zod запроса и ответа лежат рядом с каждым маршрутом
  (`schema.ts`): маршрут разбирает ими запрос, его ответ — `satisfies` схемы, а схема сверяется с доменным типом
  (`sameType<z.output<…>, Hotel>()` падает на `npm run typecheck`, если поле есть только в одном). Документ собирает
  `src/lib/openapi/document.ts` через `z.toJSONSchema` (JSON Schema 2020-12); новый маршрут добавьте в `API_OPERATIONS` —
  тест падает, если `route.ts` или его метод не описан. Примеры — реальные ответы по отелю ota-9096882 с сокращёнными
  массивами: `npm run dev`, затем `npm run docs:examples [-- http://localhost:3000]`.
- `GET /api/openapi/supabase.json` — таблицы, представления и функции Supabase, которые вызывает код `src` (`.from`,
  `.rpc`), со схемами из `database.types.ts`; файл `src/lib/openapi/supabase.gen.json` пишет `npm run docs:supabase`
  (без ключей: свой OpenAPI PostgREST отдаёт только ключу service role). Тест сверяет файл с типами и кодом.
- Ключей в документах нет: `POST /api/revalidate` описан со схемой bearer без значения, у Supabase `apikey` вводится
  вручную.

`/legal/terms`, `/legal/privacy`, `/legal/cookies`: тексты-шаблоны лежат в `src/data/legal.ts`,
разметку даёт общий `src/components/LegalPage` (дата обновления, демо-пометка, оглавление по
`h2` с якорями). Страница cookie перечисляет cookie сессии Supabase и ключи `ostrovok:v1:*`. Все страницы статические.
