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
