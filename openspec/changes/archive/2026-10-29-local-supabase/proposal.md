## Why

Основной запуск (`make up`) использует удалённую Supabase. Пользователю нужна дополнительная возможность поднять всё у себя: фронтенд и минимальную Supabase в Docker, с базой, собранной скриптами из первоисточников. Откуда какие данные в базе, нигде не собрано в одном месте.

## What Changes

- `docker-compose.local.yml`: фронтенд и минимальная Supabase self-host (Postgres `supabase/postgres`, Auth, REST, Realtime, Storage, Kong; без Studio). Образы с фиксированными версиями, `platform: linux/amd64`. Ключи моделей (GigaChat, NVIDIA) остаются удалёнными, из `.env`.
- `.env.local-supabase.example`: ключи только для локального запуска (стандартные демо-ключи self-host, помечены).
- `Makefile`: `up-local`, `down-local`, `seed-local`. Существующие цели не меняются.
- `docs/data-sources.md`: первоисточник, скрипт, обработка и команда для каждой таблицы или группы; README и `docs/docker.md` описывают оба варианта.
- Основной вариант (`docker-compose.yml`, `make up`) не меняется.

## Impact

`docker-compose.local.yml`, `docker/local-supabase/`, `.env.local-supabase.example`, `Makefile`, `README.md`, `docs/docker.md`, `docs/data-sources.md`, спека `docker`. Миграций нет, код приложения не меняется.
