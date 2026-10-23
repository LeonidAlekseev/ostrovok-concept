## Why

CI на `dev` красный с 2026-10-22: два теста зависят от текущей даты. `StarSearch.test.tsx` «picks the check-in in the search calendar…» выбирает день через 10 суток, который в конце месяца уходит на следующий месяц и не виден в календаре (`expected '2026-10-23' to be '2026-11-01'`). `BookingPage.test.tsx` «stores the booking without card data and replaces the address» получает другую сумму, если в срок попадают выходные (наценка 15 %).

## What Changes

- Тесты, зависящие от «сегодня», фиксируют системную дату через `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)`, как уже сделано в `HotelPage.test.tsx` и `useHotelSearch.test.tsx`.
- Аудит всего набора: найти остальные тесты, которые читают текущую дату (`todayIso()`, `new Date()`, `Date.now()`) без фиксации, и зафиксировать дату там, где результат от неё зависит.
- Код приложения не меняется.

## Impact

`src/**/*.test.ts(x)`. Новая спека `test-suite`.
