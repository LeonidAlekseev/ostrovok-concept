## 1. Замер
- [ ] 1.1 Время по файлам и тестам до изменений (`vitest --reporter=json`), в отчёт — топ-15

## 2. Сокращение
- [ ] 2.1 `SearchResultsPage.test.tsx`: убрать дубли, общая подготовка, фейковые таймеры; список удалённых тестов с причиной
- [ ] 2.2 `StarSearch.test.tsx`, `AssistantSearch.test.tsx`: без реальных ожиданий

## 3. Проверка
- [ ] 3.1 Три полных `npm test` подряд без падений; время ≤ 90 с, ни один тест > 1,5 с
- [ ] 3.2 `npm run lint`, `npm run typecheck`, `npm run format:check`; CI-шаг `npm test` до/после
