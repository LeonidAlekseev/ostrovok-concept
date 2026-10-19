# Proposal

## Why

Находки `add-ci-checks` (TODO, «Предложения»):
- `concurrency` с `cancel-in-progress: true` (`.github/workflows/ci.yml:11`) отменяет и прогоны на push в `main` и `dev`. После серии merge проверяется только последний коммит ветки.
- `actions/checkout@v4` и `actions/setup-node@v4` (`ci.yml:20`, `ci.yml:22`) подключены по подвижному тегу. Подмена тега стороннего action запустит чужой код в CI.
- Список команд в README, раздел «Запуск» (`README.md:15`), не содержит `npm test` и `npm run format:check`, хотя CI их запускает.

## What Changes

- Отменять устаревшие прогоны только для `pull_request`. Прогоны на push в `dev` и `main` не отменяются.
- Закрепить `actions/checkout` и `actions/setup-node` по полному SHA коммита релиза, с комментарием версии (`# v4.x.y`).
- Добавить `npm test` и `npm run format:check` в список команд раздела «Запуск».

Поведение приложения не меняется, delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `.github/workflows/ci.yml`, `README.md` (раздел «Запуск»).
- Источник: TODO, «Предложения», пункты 1–3.
