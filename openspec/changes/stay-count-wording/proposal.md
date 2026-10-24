## Why
Счётчик на `/search` пишет «Найдено N отелей» (`SearchResultsPage.tsx:303`), хотя в выдаче есть хостелы, апартаменты и виллы. Решение пользователя 2026-10-24: «Найдено N вариантов».

## What Changes
- Счётчик результатов: «Найдено N вариант / варианта / вариантов» по правилам числа (`countRu`).
- «Ничего не нашлось» остаётся.

## Impact
- `src/components/SearchResultsPage/SearchResultsPage.tsx`, его тесты. Spec `search-results-page`.
