# Proposal

## Why

В проекте нет тестов. Чистая логика (`lib/search.ts`, `lib/assistant.ts`, `lib/dates.ts`, `lib/format.ts`) будет меняться в следующих changes, и без тестов регрессии не поймать.

## What Changes

- Добавить тестовый раннер и скрипт `test`.
- Написать юнит-тесты на: `validateSearch`, `suggestDestinations`, `resolveTarget` (`lib/search.ts`); `parseWish`, `mergeBrief`, `makePlan` (`lib/assistant.ts`); функции дат и `formatDateRange` (`lib/dates.ts`); `pluralRu` (`lib/format.ts`).
- Тесты фиксируют текущее поведение. Найденные расхождения со спецификацией не чинятся здесь, а уходят в отдельные changes.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. Поведение не меняется, тесты его документируют (`skip_specs: true`).

## Impact

- `package.json`, lockfile, конфиг раннера.
- Новые файлы `src/lib/*.test.ts`.
