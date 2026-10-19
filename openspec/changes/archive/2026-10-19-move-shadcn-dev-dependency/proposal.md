# Proposal

## Why

`npm audit` показывает 7 уязвимостей high: `braces` → `micromatch` → `fast-glob`, транзитивно через CLI `shadcn` (находка `reduce-page-css`). Пакет `shadcn` лежит в `dependencies`, хотя приложение берёт из него только `shadcn/tailwind.css` при сборке (`src/app/globals.css:4`). CLI запускается через `npx shadcn@latest` (README, «Стили»). В клиентский бандл код CLI не попадает.

## What Changes

- Перенести `shadcn` в `devDependencies`.
- Обновить `shadcn` до версии без уязвимых транзитивных зависимостей, если она есть; иначе — `overrides` на исправленные версии, если они совместимы. Без `npm audit fix --force`.
- Записать результат `npm audit` и `npm audit --omit=dev` до и после в proposal.md, раздел «Замеры».

Поведение не меняется, delta-спецификаций нет (`skip_specs: true`).

## Замеры

Окружение: `shadcn@4.22.1` (latest), Node из `engines`, `npm ci` по исходному `package-lock.json`.

До изменений (`npm audit`, `npm audit --omit=dev`):

- `npm audit`: 7 high (`@shadcn/registry`, `@ts-morph/common`, `braces`, `fast-glob`, `micromatch`, `shadcn`, `ts-morph`).
- `npm audit --omit=dev`: 7 high (те же пакеты; `shadcn` ещё в `dependencies`).

После изменений:

- `npm audit --omit=dev`: 0 уязвимостей. `shadcn` перенесён в `devDependencies`, в prod-дереве его больше нет.
- `npm audit`: 7 high, без изменений. `shadcn` остаётся на `^4.22.1` (latest), `overrides` не добавлены.

Причина, почему 7 остаются в полном дереве: все версии `braces` (`<=3.0.3`, последняя `3.0.3` от 2024-05) уязвимы, исправленной версии в npm нет. `micromatch@4.0.8` и `fast-glob@3.3.3` (последние) зависят от `braces@^3.0.3`, `@shadcn/registry@0.2.0` и `@ts-morph/common` тянут `fast-glob`. Цепочка `shadcn` → `@shadcn/registry` → `fast-glob` → `micromatch` → `braces` не разрывается ни новой версией, ни `overrides`. Вариант `shadcn@1.0.0` из подсказки `npm audit` — даунгрейд с breaking change, не выполнялся. Полностью убрать уязвимости из dev-дерева можно только заменой CLI (вне scope). Уязвимости dev-only: `shadcn` вызывается только через `npx shadcn@latest` и при сборке не исполняется.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `package.json`, `package-lock.json`.
- Сборка Vercel ставит `devDependencies` по умолчанию; `npm run build` и превью Vercel проверяют, что `shadcn/tailwind.css` по-прежнему находится.
- Источник: TODO, «Предложения», пункт 8.
