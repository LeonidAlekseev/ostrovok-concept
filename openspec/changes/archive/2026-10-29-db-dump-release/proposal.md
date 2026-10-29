## Why

Заполнить локальную Supabase можно только пересборкой из первоисточников (`make seed-local`, `make seed-local-geo`): долго, нужны ключи NVIDIA и внешние файлы. Готовый дамп живой базы поднимает ту же базу за минуты.

## What Changes

- `scripts/db-dump.sh`, `make dump-db`: два архива `pg_dump -Fc` (вся схема `public`; данные `auth.users`, `auth.identities` и `supabase_migrations.schema_migrations`), `SHA256SUMS` и `MANIFEST` в `dist/db-dump/`. Только чтение, строка подключения в вывод не попадает.
- `scripts/db-restore.sh`, `make restore-local`: файлы из `dist/db-dump/` или из GitHub Release (`gh release download`), проверка `SHA256SUMS`, восстановление в локальную Supabase вместо `seed-local`.
- Документация: README, `docs/data-sources.md`, `docs/docker.md`; тег релиза `data-2026-10-29`.

## Impact

`Makefile`, `scripts/`, `README.md`, `docs/`, спека `docker`. Миграций нет, код приложения и образы не меняются. `dist/` уже в `.gitignore`.
