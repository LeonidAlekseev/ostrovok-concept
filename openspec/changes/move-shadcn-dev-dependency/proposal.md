# Proposal

## Why

`npm audit` показывает 7 уязвимостей high: `braces` → `micromatch` → `fast-glob`, транзитивно через CLI `shadcn` (находка `reduce-page-css`). Пакет `shadcn` лежит в `dependencies`, хотя приложение берёт из него только `shadcn/tailwind.css` при сборке (`src/app/globals.css:4`). CLI запускается через `npx shadcn@latest` (README, «Стили»). В клиентский бандл код CLI не попадает.

## What Changes

- Перенести `shadcn` в `devDependencies`.
- Обновить `shadcn` до версии без уязвимых транзитивных зависимостей, если она есть; иначе — `overrides` на исправленные версии, если они совместимы. Без `npm audit fix --force`.
- Записать результат `npm audit` и `npm audit --omit=dev` до и после в proposal.md, раздел «Замеры».

Поведение не меняется, delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `package.json`, `package-lock.json`.
- Сборка Vercel ставит `devDependencies` по умолчанию; `npm run build` и превью Vercel проверяют, что `shadcn/tailwind.css` по-прежнему находится.
- Источник: TODO, «Предложения», пункт 8.
