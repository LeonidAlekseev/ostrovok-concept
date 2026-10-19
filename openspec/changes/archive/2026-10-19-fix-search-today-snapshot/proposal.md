# Proposal

## Why

Находки `fix-search-dates-effect` (TODO, «Предложения»):
- Форма берёт стартовые даты от снимка `today` из `useSyncExternalStore`, а `run` валидирует по свежему `todayIso()` (`src/hooks/useHotelSearch.ts:69`). Если вкладка открыта через полночь, даты на экране и правила валидации считаются от разных дней.
- `window.history.replaceState` после поиска (`useHotelSearch.ts:80`) не покрыт тестом.

## What Changes

- `run` валидирует по тому же снимку `today`, от которого форма считает стартовые даты. Пока снимок пуст (сервер и гидрация), используется `todayIso()`, как сейчас.
- Тест: после успешного поиска адрес содержит `?<result.params>`; после ошибки валидации и после отмены адрес не меняется.

Требование «Стартовые даты от текущего дня» не меняется: даты по-прежнему от дня загрузки формы. Автоматический сдвиг дат в полночь не вводится. Delta-спецификаций нет (`skip_specs: true`).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет.

## Impact

- `src/hooks/useHotelSearch.ts`, `src/hooks/useHotelSearch.test.tsx`.
- Источник: TODO, «Предложения», пункты 4–5.
