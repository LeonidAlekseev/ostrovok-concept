## Why

Организаторы требуют: в корне `secrets.env.age`, зашифрованный их ключом, `.env.example` с комментариями, `.env` в `.gitignore`, запуск по README. Решение пользователя 2026-10-28: перейти с git-secret на age, добавить Docker для Docker Desktop. Vercel остаётся нативным, без Docker.

## What Changes

- **BREAKING** git-secret удалён: `.gitsecret/`, `.env.local.secret`, `GIT_SECRET_PRIVATE_KEY`, пакет `openpgp`.
- `.env` — единственный источник ключей (не в git); `.env.local` больше не используется.
- `secrets.env.age` — `.env` для организаторов (только их ключ); `secrets.app.env.age` — то же для приложения (только наш ключ).
- `npm run secrets:encrypt` создаёт оба файла из `.env` (пакет `age-encryption`, без бинарника `age`); `npm run secrets:reveal` пишет `.env` из `secrets.app.env.age`.
- Сборка и сервер берут `process.env`, иначе расшифровывают `secrets.app.env.age` ключом `AGE_SECRET_KEY`.
- `Dockerfile` (Next.js `output: standalone`, multi-stage), `docker-compose.yml`, `.dockerignore`; `docker compose up --build`.
- README: провайдер NVIDIA API и модели, шаги запуска, Docker Desktop, Vercel, обновление секретов.

## Impact

`.gitignore`, `.env.example`, `package.json` (скрипты, зависимости), `next.config.ts`, `scripts/secrets.mjs`, `src/lib/secrets*`, README, `Dockerfile`, `docker-compose.yml`, `.dockerignore`. Спека `secrets` меняется, новая `docker`. В Vercel: добавить `AGE_SECRET_KEY`, удалить `GIT_SECRET_PRIVATE_KEY`.
