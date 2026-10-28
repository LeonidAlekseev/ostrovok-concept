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
