# Tasks

## 1. Реализация

- [x] 1.1 Читать «сегодня» в `useHotelSearch` через `useSyncExternalStore` с серверным снимком `''`; проверка: `npm run typecheck` проходит.
- [x] 1.2 Хранить в state только выбранные пользователем даты, стартовые вычислять при рендере; удалить эффект в `src/hooks/useHotelSearch.ts:42-45`; проверка: `npm run lint` без предупреждений.

## 2. Тесты

- [x] 2.1 Добавить тест: после монтирования `query.checkIn` — завтра, `query.checkOut` — через ночь; после `setDates` хук возвращает выбранные даты; проверка: `npm test` проходит.

## 3. Проверка

- [x] 3.1 `npm run format:check`, `npm run build`; в `npm run start` консоль без hydration warnings, форма показывает завтрашний заезд; проверка: результат записан в описании PR.
