## ADDED Requirements

### Requirement: Дамп живой базы

Репозиторий SHALL содержать `scripts/db-dump.sh` (`make dump-db`), который только читает живую базу (`SUPABASE_DB_URL`) и пишет в `dist/db-dump/` дамп (`pg_dump -Fc`), `SHA256SUMS` и `MANIFEST`. В дамп SHALL входить вся схема `public` (структура и данные), данные `auth.users` и `auth.identities` и таблица `supabase_migrations.schema_migrations`; сессии, токены, коды и файлы Storage SHALL не входить. Строка подключения и пароли SHALL не попадать в вывод, `dist/` SHALL оставаться вне git.

#### Scenario: Снятие дампа

- **WHEN** выполняют `make dump-db`
- **THEN** в `dist/db-dump/` появляются архивы, `SHA256SUMS` и `MANIFEST` с датой, коммитом, числом строк по таблицам и размером, а живая база не меняется

### Requirement: Восстановление дампа в локальную базу

Цель `make restore-local` (`scripts/db-restore.sh`) SHALL брать файлы из `dist/db-dump/` или из GitHub Release (`gh release download`), проверять `SHA256SUMS` до любых изменений и загружать дамп в локальную Supabase вместо `seed-local`.

#### Scenario: Восстановление

- **WHEN** после `make up-local` выполняют `make restore-local`
- **THEN** контрольные суммы проверены, схема `public`, демо-аккаунты и история миграций загружены, и `npm run db:push` ничего не применяет повторно

#### Scenario: Повреждённый файл

- **WHEN** хеш файла не совпадает с `SHA256SUMS`
- **THEN** восстановление останавливается до любых изменений локальной базы
