# Tasks

## 1. Раннер

- [x] 1.1 Установить `vitest` как devDependency, добавить скрипт `test` и конфиг с окружением `node`; проверка: `npm test` запускается и завершается с кодом 0 (даже при одном smoke-тесте).

## 2. Тесты дат и формата

- [x] 2.1 Тесты `src/lib/dates.test.ts`: `toIso`, `fromIso`, `addDays` (переход через месяц и год), `nightsBetween`, `todayIso` с фиксированным временем, три варианта `formatDateRange` из спецификации; проверка: `npm test` проходит.
- [x] 2.2 Тесты `src/lib/format.test.ts`: `pluralRu` для 1, 2, 5, 11, 21, 22; проверка: `npm test` проходит.

## 3. Тесты поиска и ассистента

- [x] 3.1 Тесты `src/lib/search.test.ts`: `validateSearch` (пустое направление, даты в прошлом, больше 30 ночей, гости), `suggestDestinations` (пустой ввод, сценарий, начало названия, вхождение), `resolveTarget`; проверка: `npm test` проходит.
- [x] 3.2 Тесты `src/lib/assistant.test.ts`: `parseWish`, `mergeBrief`, `makePlan` по фактическим сигнатурам из модуля; проверка: `npm test` проходит.

## 4. Проверка

- [x] 4.1 Выполнить `npm test` и `npm run typecheck`; проверка: оба завершаются с кодом 0.
