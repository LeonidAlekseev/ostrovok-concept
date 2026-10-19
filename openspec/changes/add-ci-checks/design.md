# Design

## Context

Скрипты проверок уже есть в `package.json`: `lint` (oxlint), `typecheck` (`tsc --noEmit`), `test` (vitest, проекты `unit` и `components` на jsdom), `format:check` (prettier). На текущем `dev` все проходят; `lint` выдаёт одно предупреждение и завершается с кодом 0.

## Goals / Non-Goals

**Goals:**
- Каждый PR в `dev` и `main` проверяется lint, typecheck, тестами и форматированием.
- Падение любой проверки делает PR красным.

**Non-Goals:**
- Сборка и деплой (делает Vercel).
- Запрет предупреждений lint (`--deny-warnings`): отдельное решение после `fix-search-dates-effect`.
- Правила защиты веток (недоступны на текущем тарифе GitHub для приватного репозитория).

## Decisions

**Один job, шаги по очереди.** Проверки быстрые (тесты ≈ 11 с), матрица и параллельные job не нужны. Имя job — `checks`, имя workflow — `CI`.

**Node 24 через `actions/setup-node` с `cache: npm`.** Удовлетворяет `engines` (`>=20.9`) и требованию CLI `cn` (Node 22+) для `compile-cn-tables`.

**`concurrency` по ветке с `cancel-in-progress`.** Новый push отменяет устаревший прогон.

**Права `contents: read`.** Workflow ничего не пишет в репозиторий.

## Risks / Trade-offs

- [Минуты Actions для приватного репозитория ограничены] → Один короткий job; при исчерпании лимита эскалировать.
- [Различие окружения CI и локального] → `npm ci` по `package-lock.json`.

## Migration Plan

Один коммит. Откат — удаление workflow.

## Open Questions

Нет.
