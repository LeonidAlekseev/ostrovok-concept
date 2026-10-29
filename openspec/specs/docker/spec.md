# docker Specification

## Purpose
Локальный запуск приложения в Docker (Docker Desktop) одной командой `docker compose up --build`, без ключей в слоях образа.

## Requirements

### Requirement: Запуск в Docker
Репозиторий SHALL содержать `Dockerfile` (Next.js `output: standalone`, multi-stage), `docker-compose.yml` и `.dockerignore`. Приложение SHALL запускаться командой `docker compose up --build` с ключами из `.env` (`env_file`) или из одного `AGE_SECRET_KEY`.

#### Scenario: Запуск
- **WHEN** выполняют `docker compose up --build` с `.env`
- **THEN** открываются `/`, страница отеля и `/api/docs`

### Requirement: Секреты вне слоёв образа
Образ SHALL не содержать значений ключей: `.env` исключён `.dockerignore`, ключ сборки передаётся секретом сборки.

#### Scenario: Слои
- **WHEN** ищут значения ключей в `docker history` и файлах образа
- **THEN** их нет

### Requirement: Дополнительный запуск с локальной Supabase

Репозиторий SHALL содержать `docker-compose.local.yml`: фронтенд и минимальную Supabase self-host (Postgres, Auth, REST, Realtime, Storage, Kong) с образами фиксированных версий. Запуск SHALL идти целями `make up-local`, `make seed-local`, `make down-local`; `docker-compose.yml` и `make up` (удалённая Supabase) SHALL работать как прежде. Ключи локального варианта SHALL лежать в `.env.local-supabase` вне git, образец — `.env.local-supabase.example`; ключи моделей берутся из `.env`.

#### Scenario: Данные локальной базы

- **WHEN** выполняют `make up-local`, затем `make seed-local`
- **THEN** все миграции `supabase/migrations` применены к локальной базе, каталог и демо-аккаунты загружены, а приложение открывается на `http://localhost:8080`

#### Scenario: Основной вариант

- **WHEN** выполняют `make up`
- **THEN** приложение работает с удалённой Supabase, как до появления локального варианта

### Requirement: Загрузка геоданных в локальную базу

Репозиторий SHALL содержать цель `make seed-local-geo`, которая в контейнере `tools` загружает в локальную базу здания EUBUCCO (с S3), границы покрытия (Nominatim) и места OSM (выгрузка Geofabrik «Valencia»), затем выполняет `db:features`. Шум EEA SHALL загружаться только при заданной `NOISE_GPKG`; без неё шаг пропускается с указанием, где скачать файл. Инструменты Python SHALL добавляться только в стадию `tools`, образ `runner` SHALL не меняться.

#### Scenario: Без файла шума

- **WHEN** выполняют `make seed-local-geo` без `NOISE_GPKG`
- **THEN** здания, границы и места загружены, шаг шума пропущен с сообщением и ссылкой на страницу EEA

#### Scenario: С файлом шума

- **WHEN** выполняют `NOISE_GPKG=/путь/ES.gpkg make seed-local-geo`
- **THEN** файл смонтирован в контейнер только для чтения и загружен командой `noise`

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
