# Tasks

## 1. Общая функция поиска сценария

- [ ] 1.1 Добавить и экспортировать `findScenario(text)` в `src/lib/search.ts`, использовать её в `suggestDestinations`; проверка: `npm run typecheck` проходит.
- [ ] 1.2 Заменить сравнение в `DestinationField.tsx` (`scenarios.find(... toLowerCase ...)`) на `findScenario(value)`; проверка: `grep -n toLowerCase src/components/SearchForm/DestinationField.tsx` не находит сравнения сценария.
- [ ] 1.3 Добавить тест в `src/lib/search.test.ts`: `findScenario` находит сценарий при разном регистре, пробелах по краям и «ё»/«е»; проверка: `npm test` проходит.

## 2. Проверка

- [ ] 2.1 В dev-сервере ввести «На выходные» и вариант с «ё» (если есть в заголовках сценариев): пункт сценария появляется в подсказках; проверка: ручной просмотр, результат в описании PR.
