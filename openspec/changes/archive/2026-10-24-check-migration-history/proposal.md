## Why
Миграции применялись в базу Supabase не по порядку версий. Перед удалением таблиц `routes` и `trips` (`drop-routes-trips-tables`) нужно знать, что история миграций в базе совпадает с файлами `supabase/migrations/`, иначе `db:push` может пропустить или повторить миграцию.

## What Changes
- Сверить `supabase_migrations.schema_migrations` с файлами `supabase/migrations/*.sql`: версии, порядок, пропуски, лишние записи.
- Сверить фактическую схему базы (таблицы, функции, политики RLS) с результатом миграций.
- Итог — отчёт в `design.md` этого change: совпадает или нет, что расходится.
- Если история расходится, исправление (`supabase migration repair` или новая миграция) — только после согласования с пользователем. Схему и данные этот change не меняет.

## Impact
- Только чтение базы. Файлы: `openspec/changes/check-migration-history/design.md`. Specs не меняются.
