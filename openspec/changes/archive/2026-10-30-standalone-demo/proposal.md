## Why

Облачную базу Supabase удалят. Деплой Vercel должен работать без внешней базы, с демо-кабинетами путешественника и отельера. Ветка `standalone` становится демо-версией без базы; `dev` и `main` остаются полной версией с Supabase.

## What Changes

- `scripts/export-standalone.ts` один раз (только чтение) выгружает снимок базы в `data/standalone`: таблицы сайта, векторы float32, демо-чаты, ответы PostGIS-функций, записанные при обходе всех 220 отелей прокси-рекордером, и карты шума и вида как сжатые тайлы в `public/standalone/maps`.
- `src/lib/standalone`: клиент с интерфейсом Supabase (`from`, `rpc`, `auth`, `channel`, `storage`) поверх снимка; построитель запросов PostgREST, функции базы на JS (FTS со стеммером Snowball, косинус, RRF, места OSM, функции и триггеры отельера), политики строк.
- Записи пользователя — в `localStorage`; запросы к API несут их, маршруты возвращают свои записи «хвостом» ответа; Realtime — события `Db`, `storage` и опрос.
- Вход в демо-кабинеты — cookie без паролей и ключей; вход по почте недоступен.
- GigaChat убран из цепочки и кода; модели — только NVIDIA.
- Docker и README: демо-версия без базы.

## Impact

Только ветка `standalone`. Код: `src/lib/standalone/*`, клиенты `src/lib/supabase/*`, `src/lib/db/anon.ts`, `serviceClient.ts`, маршруты API (обёртка `withStandaloneDb`), карты, вход, `src/lib/ai/model.ts`. Тесты полной версии на моках Supabase исключены в `vitest.config.ts`. Миграций нет, живая база только читалась.
