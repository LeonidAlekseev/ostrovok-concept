# Proposal

## Why

Поиск сценария в подсказках `src/components/SearchForm/DestinationField.tsx` сравнивает текст через `toLowerCase()`, а `src/lib/search.ts` — через `normalize()` (trim, локаль `ru`, `ё` → `е`). Из-за этого подсказка сценария и поиск расходятся: вариант с «ё» может не найти сценарий. Требование уже есть в спецификации `manual-search` («Сравнение текста SHALL не учитывать регистр, пробелы по краям и различие «ё»/«е»»), код его не выполняет.

## What Changes

- Выделить поиск сценария по тексту в одну функцию `findScenario` в `src/lib/search.ts`.
- `suggestDestinations` и `DestinationField` SHALL использовать эту функцию, а не собственные сравнения.
- Добавить тест на сравнение сценария с разным регистром и «ё»/«е».

Поведение спецификации не меняется: она уже описывает нужное поведение, поэтому delta-спецификация не нужна (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. Требования `manual-search` уже покрывают поведение; код приводится к ним.

## Impact

- `src/lib/search.ts`: новая функция `findScenario`, использование в `suggestDestinations`.
- `src/components/SearchForm/DestinationField.tsx`: сравнение через `findScenario`.
- Тест в `src/lib/search.test.ts`. Требует раннера из `add-unit-tests`, поэтому change идёт после него.
