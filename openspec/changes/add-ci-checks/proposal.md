# Proposal

## Why

У PR есть только проверки Vercel: они собирают проект, но не запускают lint, typecheck, тесты и проверку форматирования. Регрессии в тестах и lint ловятся только локально.

## What Changes

- Workflow GitHub Actions `.github/workflows/ci.yml`: на `pull_request` в `dev` и `main` и на `push` в `dev` и `main` выполняются `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`.
- Сборка в CI не дублируется: её выполняет Vercel.
- README, раздел «Запуск», упоминает CI.

Поведение приложения не меняется, поэтому delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- Новый файл `.github/workflows/ci.yml`, README.
- Все следующие PR получают проверку `CI`.
- Источник: TODO, «Предложения».
