## Why
Типы строк Supabase в `src/lib/db/catalog.ts` и `src/lib/ai/semantic.ts` написаны вручную и расходятся со схемой без предупреждения. CLI `supabase` уже в `devDependencies`.

## What Changes
- Скрипт `npm run db:types`: `supabase gen types typescript` по базе проекта в `src/lib/db/database.types.ts`.
- Клиенты Supabase (`src/lib/db/catalog.ts`, `src/lib/ai/semantic.ts`, `src/lib/supabase/*`) типизируются `Database`; ручные типы строк заменяются производными от `Database`.
- В README — когда перегенерировать типы (после каждой миграции).
- Поведение не меняется.

## Impact
- `package.json` (скрипт), `src/lib/db/`, `src/lib/ai/semantic.ts`, `src/lib/supabase/`, README. Specs не меняются.
- Зависит от `drop-routes-trips-tables` (типы без удалённых таблиц) и `fix-semantic-query-abort` (общий файл `semantic.ts`).
